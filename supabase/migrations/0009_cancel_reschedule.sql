-- Cancellation + reschedule flow.
--
-- A cancelled booking must FREE its slot so it can be booked again. The
-- existing unique + overlap constraints block all rows regardless of status,
-- so they're replaced with partial versions that ignore cancelled bookings.

alter table bookings add column if not exists cancelled_at timestamptz;

-- Exact-slot uniqueness, ignoring cancelled bookings.
alter table bookings drop constraint if exists bookings_court_id_slot_id_booking_date_key;
create unique index if not exists bookings_active_slot_uniq
  on bookings (court_id, slot_id, booking_date)
  where status <> 'cancelled';

-- Time-overlap protection, ignoring cancelled bookings.
alter table bookings drop constraint if exists bookings_no_overlap;
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (court_id with =, booking_date with =, slot_minutes with &&)
  where (status <> 'cancelled');

-- Slot availability must treat cancelled bookings as free.
create or replace function public.taken_slot_ids(p_court_id uuid, p_date date)
returns table(slot_id uuid)
language sql
security definer
set search_path = public
as $$
  select b.slot_id
  from bookings b
  where b.court_id = p_court_id
    and b.booking_date = p_date
    and b.status <> 'cancelled';
$$;

-- Client-facing cancel: phone-gated so only the booking owner (who has both
-- the booking link and the phone on it) can cancel. Completed bookings can't
-- be cancelled.
create or replace function public.cancel_booking(p_id uuid, p_phone text)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where id = p_id;
  if v_booking.id is null then
    raise exception 'booking not found';
  end if;
  if v_booking.client_phone <> p_phone then
    raise exception 'unauthorized';
  end if;
  if v_booking.status = 'completed' then
    raise exception 'cannot cancel a completed booking';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;

  update bookings
    set status = 'cancelled', cancelled_at = now()
    where id = p_id
    returning * into v_booking;

  insert into audit_logs (action, entity_type, entity_id, details, performed_by)
  values ('booking.cancelled', 'booking', p_id, jsonb_build_object('via', 'client'), 'client');

  return v_booking;
end;
$$;

grant execute on function public.cancel_booking(uuid, text) to anon, authenticated;
