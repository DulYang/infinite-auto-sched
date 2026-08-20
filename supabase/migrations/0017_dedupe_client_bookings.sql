-- Prevent the SAME client from ending up with two active bookings on an
-- overlapping slot.
--
-- Observed in production: the same phone number submitting the booking form
-- twice within ~15-30 seconds of each other for the exact same slot (e.g. a
-- double-tap on mobile, or a retry after the client's connection drops while
-- waiting on the booking response — POST /api/bookings awaits a synchronous
-- WhatsApp send that can legitimately take 20-45s). The admin was manually
-- finding and cancelling the duplicate each time. This was never a real
-- contested-slot case (two different people wanting the same time) — the
-- soft-hold design already handles that correctly and is untouched here.
--
-- Two layers:
--   1. create_booking is made idempotent: if this exact client already has
--      an active booking overlapping this time range on this date, return
--      THAT booking instead of inserting a new one. A retry becomes a no-op.
--   2. A GiST exclusion constraint is the hard backstop for true races (two
--      near-simultaneous requests both reading "no existing booking" before
--      either commits) — mirrors bookings_no_overlap, scoped to one client.

alter table bookings
  add constraint bookings_client_no_duplicate
  exclude using gist (client_phone with =, court_id with =, booking_date with =, slot_minutes with &&)
  where (status <> 'cancelled');

create or replace function public.create_booking(
  p_court_id uuid,
  p_slot_id uuid,
  p_booking_date date,
  p_client_name text,
  p_client_phone text,
  p_notes text
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_start time;
  v_end time;
  v_minutes int;
  v_amount numeric;
  v_range int4range;
begin
  select start_time, end_time,
         (extract(epoch from (end_time - start_time)) / 60)::int
    into v_start, v_end, v_minutes
  from time_slots where id = p_slot_id;
  if v_minutes is null then
    raise exception 'slot not found';
  end if;

  v_amount := case v_minutes when 120 then 350000 when 60 then 250000 else null end;
  if v_amount is null then
    raise exception 'unsupported slot duration';
  end if;

  v_range := int4range(
    (extract(hour from v_start) * 60 + extract(minute from v_start))::int,
    (extract(hour from v_end) * 60 + extract(minute from v_end))::int
  );

  -- Idempotency: if this same client already has an ACTIVE booking
  -- overlapping this exact time range on this date, hand back that booking
  -- instead of creating a duplicate. Handles double-taps and client-side
  -- retries after a dropped/slow connection (the booking may already exist
  -- server-side even though the client never saw the response).
  select * into v_booking
  from bookings b
  where b.court_id = p_court_id
    and b.booking_date = p_booking_date
    and b.client_phone = p_client_phone
    and b.status <> 'cancelled'
    and b.slot_minutes && v_range
  order by b.created_at asc
  limit 1;
  if found then
    return v_booking;
  end if;

  -- Reject only if a CONFIRMED/COMPLETED booking already occupies the time
  -- (a different client, or this same client re-confirming something already
  -- theirs would have been returned above).
  if exists (
    select 1 from bookings b
    where b.court_id = p_court_id
      and b.booking_date = p_booking_date
      and b.status in ('confirmed', 'completed')
      and b.slot_minutes && v_range
  ) then
    raise exception 'slot already booked' using errcode = '23P01';
  end if;

  begin
    insert into bookings (court_id, slot_id, booking_date, client_name, client_phone, status, amount_due, notes)
    values (p_court_id, p_slot_id, p_booking_date, p_client_name, p_client_phone, 'pending_payment', v_amount, p_notes)
    returning * into v_booking;
  exception
    when exclusion_violation or unique_violation then
      -- Lost a race with a concurrent duplicate submission from this same
      -- client (bookings_client_no_duplicate fired) — fetch and return
      -- whichever row won instead of erroring out.
      select * into v_booking
      from bookings b
      where b.court_id = p_court_id
        and b.booking_date = p_booking_date
        and b.client_phone = p_client_phone
        and b.status <> 'cancelled'
        and b.slot_minutes && v_range
      order by b.created_at asc
      limit 1;
      if not found then
        raise;
      end if;
  end;

  return v_booking;
end;
$$;

grant execute on function public.create_booking(uuid, uuid, date, text, text, text)
  to anon, authenticated;
