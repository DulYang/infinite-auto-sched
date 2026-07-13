-- Let the reschedule picker ignore the booking being moved.
--
-- With overlap-based availability (0012), a booking's own time range would
-- mark nearby half-hour starts as taken while rescheduling it — even though
-- the DB allows the move (the exclusion constraint only checks OTHER rows).
-- Add an optional p_exclude_booking parameter. The old 2-arg signature is
-- dropped (not kept as an overload) so PostgREST calls stay unambiguous;
-- existing callers use named params and hit the default.

drop function if exists public.taken_slot_ids(uuid, date);

create or replace function public.taken_slot_ids(
  p_court_id uuid,
  p_date date,
  p_exclude_booking uuid default null
)
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
      and (p_exclude_booking is null or b.id <> p_exclude_booking)
      and b.slot_minutes && int4range(
        (extract(hour from s.start_time) * 60 + extract(minute from s.start_time))::int,
        (extract(hour from s.end_time) * 60 + extract(minute from s.end_time))::int
      )
  );
$$;

grant execute on function public.taken_slot_ids(uuid, date, uuid) to anon, authenticated;
