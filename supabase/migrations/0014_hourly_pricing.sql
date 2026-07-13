-- Hourly bookings with duration-based pricing.
--
-- Two durations are now offered: 2 hours (Rp 350.000, the recommended
-- default) and 1 hour (Rp 250.000). Both may start on any 30-minute boundary.
-- Price is computed HERE from the slot's duration — not passed in by the
-- client — so it cannot be tampered with via the public API.

-- 1-hour slots: starts 08:00..21:00 every 30 minutes (end <= 22:00).
-- The existence check includes end_time because 2-hour slots already use the
-- same start times.
insert into time_slots (label, start_time, end_time)
select
  to_char(g.t, 'HH24.MI') || ' - ' || to_char(g.t + interval '1 hour', 'HH24.MI'),
  g.t::time,
  (g.t + interval '1 hour')::time
from generate_series(
  timestamp '2000-01-01 08:00',
  timestamp '2000-01-01 21:00',
  interval '30 minutes'
) as g(t)
where not exists (
  select 1 from time_slots s
  where s.start_time = g.t::time and s.end_time = (g.t + interval '1 hour')::time
);

-- create_booking now derives the amount from the slot duration. The old
-- 7-arg signature (with p_amount_due) is dropped so the price can no longer
-- be supplied by callers.
drop function if exists public.create_booking(uuid, uuid, date, text, text, text, numeric);

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
  v_minutes int;
  v_amount numeric;
begin
  select (extract(epoch from (end_time - start_time)) / 60)::int
    into v_minutes from time_slots where id = p_slot_id;
  if v_minutes is null then
    raise exception 'slot not found';
  end if;

  v_amount := case v_minutes when 120 then 350000 when 60 then 250000 else null end;
  if v_amount is null then
    raise exception 'unsupported slot duration';
  end if;

  insert into bookings (court_id, slot_id, booking_date, client_name, client_phone, status, amount_due, notes)
  values (p_court_id, p_slot_id, p_booking_date, p_client_name, p_client_phone, 'pending_payment', v_amount, p_notes)
  returning * into v_booking;
  return v_booking;
end;
$$;

grant execute on function public.create_booking(uuid, uuid, date, text, text, text)
  to anon, authenticated;

-- PII-safe busy ranges for the booking page's clock diagram: just the
-- occupied minute ranges for a court + date, nothing about who booked.
create or replace function public.booked_ranges(p_court_id uuid, p_date date)
returns table(start_min int, end_min int)
language sql
security definer
set search_path = public
as $$
  select lower(b.slot_minutes), upper(b.slot_minutes)
  from bookings b
  where b.court_id = p_court_id
    and b.booking_date = p_date
    and b.status <> 'cancelled';
$$;

grant execute on function public.booked_ranges(uuid, date) to anon, authenticated;
