-- Bookings stay 2 hours long, but may now start on any 30-minute boundary
-- between 08:00 and 20:00 (e.g. 09:30-11:30), as long as no other booking
-- overlaps. The bookings_no_overlap exclusion constraint (0006/0009) already
-- enforces non-overlap for ANY pair of time ranges, so this only needs:
--   1. slot rows for every 30-minute start (25 total), with labels in
--      consistent 24-hour format, and
--   2. taken_slot_ids() redefined to return every slot whose time range
--      OVERLAPS an active booking (not just exactly-booked slot ids), so the
--      booking form greys out all conflicting start times.

-- Relabel existing slots to the 24-hour format used by the new ones.
update time_slots
set label = to_char(start_time, 'HH24.MI') || ' - ' || to_char(end_time, 'HH24.MI');

-- Add the missing 30-minute starts (keeps existing rows: bookings FK them).
insert into time_slots (label, start_time, end_time)
select
  to_char(g.t, 'HH24.MI') || ' - ' || to_char(g.t + interval '2 hours', 'HH24.MI'),
  g.t::time,
  (g.t + interval '2 hours')::time
from generate_series(
  timestamp '2000-01-01 08:00',
  timestamp '2000-01-01 20:00',
  interval '30 minutes'
) as g(t)
where not exists (select 1 from time_slots s where s.start_time = g.t::time);

-- A slot is "taken" if its range intersects any active booking's range on
-- that court + date. int4range is half-open, so back-to-back bookings
-- (10:00-12:00 after 08:00-10:00) don't block each other.
create or replace function public.taken_slot_ids(p_court_id uuid, p_date date)
returns table(slot_id uuid)
language sql
security definer
set search_path = public
as $$
  select s.id
  from time_slots s
  where exists (
    select 1
    from bookings b
    where b.court_id = p_court_id
      and b.booking_date = p_date
      and b.status <> 'cancelled'
      and b.slot_minutes && int4range(
        (extract(hour from s.start_time) * 60 + extract(minute from s.start_time))::int,
        (extract(hour from s.end_time) * 60 + extract(minute from s.end_time))::int
      )
  );
$$;
