-- Block overlapping bookings at the database level.
--
-- The existing unique(court_id, slot_id, booking_date) already prevents
-- booking the exact same slot twice. This adds true time-overlap protection
-- via a GiST exclusion constraint, so even if slots are ever reconfigured to
-- overlap (or new overlapping slots are added), the database rejects any two
-- bookings for the same court + date whose time ranges intersect.
--
-- Approach: denormalize each booking's slot time range onto the row as an
-- int4range of minutes-since-midnight (kept in sync by a trigger), then add
-- an EXCLUDE constraint. btree_gist supplies the "=" operators for the uuid
-- and date columns inside the GiST index.

create extension if not exists btree_gist;

alter table bookings add column if not exists slot_minutes int4range;

-- Keep slot_minutes in sync whenever a booking's slot is set or changed.
create or replace function public.set_booking_slot_minutes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start time;
  v_end time;
begin
  select start_time, end_time into v_start, v_end
  from time_slots where id = new.slot_id;

  if v_start is null then
    raise exception 'Slot waktu tidak ditemukan';
  end if;

  new.slot_minutes := int4range(
    (extract(hour from v_start) * 60 + extract(minute from v_start))::int,
    (extract(hour from v_end) * 60 + extract(minute from v_end))::int
  );
  return new;
end;
$$;

drop trigger if exists trg_set_booking_slot_minutes on bookings;
create trigger trg_set_booking_slot_minutes
  before insert or update of slot_id on bookings
  for each row execute function public.set_booking_slot_minutes();

-- Backfill existing rows.
update bookings b set slot_minutes = int4range(
  (extract(hour from s.start_time) * 60 + extract(minute from s.start_time))::int,
  (extract(hour from s.end_time) * 60 + extract(minute from s.end_time))::int
)
from time_slots s
where b.slot_id = s.id and b.slot_minutes is null;

-- Reject any two bookings on the same court + date with intersecting ranges.
-- int4range is half-open, so adjacent slots (e.g. [480,600) and [600,720))
-- do NOT count as overlapping.
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (court_id with =, booking_date with =, slot_minutes with &&);
