-- Unconfirmed bookings become a SOFT hold ("Belum Konfirmasi"), not a hard
-- lock on the slot.
--
-- Business reason: regular clients often book their usual slot and forget to
-- pay. Previously any non-cancelled booking blocked the slot outright, so a
-- forgetful regular would freeze a slot nobody could take. Now:
--   * Only CONFIRMED/COMPLETED bookings truly take a slot (red "Terisi").
--   * PENDING_PAYMENT bookings mark the slot yellow "Belum Konfirmasi" but
--     leave it pickable — several clients may hold the same slot at once.
--   * Whoever pays gets confirmed by the admin; the DB still guarantees only
--     ONE confirmed booking per slot/time (the exclusion constraint below).
--   * Self-serve receipt upload is allowed only while a booking is the sole
--     claimant of its slot; once contested, the admin confirms manually and
--     can chase the regular ("pay now or the slot goes to someone else").

-- Which statuses count as actually occupying the slot.
--   'confirmed', 'completed' -> hard hold (blocks others)
--   'pending_payment'        -> soft hold (yellow, pickable)
--   'cancelled'              -> free

-- ── Overlap protection: confirmed/completed only ────────────────────────────
-- Relaxing the predicate (was: status <> 'cancelled') can only ever hold on
-- existing data, since the old, stricter constraint already forbade any two
-- overlapping non-cancelled rows.
alter table bookings drop constraint if exists bookings_no_overlap;
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (court_id with =, booking_date with =, slot_minutes with &&)
  where (status in ('confirmed', 'completed'));

-- Exact-slot uniqueness is now confirmed/completed-only too, so multiple
-- clients may hold the same pending slot. (Two confirmed on the exact same
-- slot are already caught by the overlap constraint above; this index is a
-- clearer, cheaper guard for the exact-match case.)
drop index if exists bookings_active_slot_uniq;
create unique index if not exists bookings_confirmed_slot_uniq
  on bookings (court_id, slot_id, booking_date)
  where status in ('confirmed', 'completed');

-- ── create_booking: allow booking a soft-held slot, block a hard-held one ───
-- The overlap constraint above no longer stops a pending insert onto a
-- confirmed slot (the NEW row is pending, so the partial index ignores it).
-- So the "already taken" rule is enforced explicitly here instead.
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

  -- Reject only if a CONFIRMED/COMPLETED booking already occupies the time.
  if exists (
    select 1 from bookings b
    where b.court_id = p_court_id
      and b.booking_date = p_booking_date
      and b.status in ('confirmed', 'completed')
      and b.slot_minutes && v_range
  ) then
    raise exception 'slot already booked' using errcode = '23P01';
  end if;

  insert into bookings (court_id, slot_id, booking_date, client_name, client_phone, status, amount_due, notes)
  values (p_court_id, p_slot_id, p_booking_date, p_client_name, p_client_phone, 'pending_payment', v_amount, p_notes)
  returning * into v_booking;
  return v_booking;
end;
$$;

grant execute on function public.create_booking(uuid, uuid, date, text, text, text)
  to anon, authenticated;

-- ── taken_slot_ids: only slots overlapping a CONFIRMED/COMPLETED booking ─────
-- These are the slots the picker must DISABLE (truly taken). Pending slots are
-- intentionally excluded so they stay pickable.
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
      and b.status in ('confirmed', 'completed')
      and (p_exclude_booking is null or b.id <> p_exclude_booking)
      and b.slot_minutes && int4range(
        (extract(hour from s.start_time) * 60 + extract(minute from s.start_time))::int,
        (extract(hour from s.end_time) * 60 + extract(minute from s.end_time))::int
      )
  );
$$;

grant execute on function public.taken_slot_ids(uuid, date, uuid) to anon, authenticated;

-- ── pending_slot_ids: slots overlapping a PENDING (soft-held) booking ────────
-- These render yellow "Belum Konfirmasi" but remain selectable.
create or replace function public.pending_slot_ids(
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
      and b.status = 'pending_payment'
      and (p_exclude_booking is null or b.id <> p_exclude_booking)
      and b.slot_minutes && int4range(
        (extract(hour from s.start_time) * 60 + extract(minute from s.start_time))::int,
        (extract(hour from s.end_time) * 60 + extract(minute from s.end_time))::int
      )
  );
$$;

grant execute on function public.pending_slot_ids(uuid, date, uuid) to anon, authenticated;

-- ── booked_ranges: now carries the hold type so the clock can paint yellow ──
-- 'confirmed' -> red (taken), 'pending' -> yellow (belum konfirmasi).
drop function if exists public.booked_ranges(uuid, date);
create or replace function public.booked_ranges(p_court_id uuid, p_date date)
returns table(start_min int, end_min int, state text)
language sql
security definer
set search_path = public
as $$
  select lower(b.slot_minutes), upper(b.slot_minutes),
         case when b.status in ('confirmed', 'completed') then 'confirmed' else 'pending' end
  from bookings b
  where b.court_id = p_court_id
    and b.booking_date = p_date
    and b.status <> 'cancelled';
$$;

grant execute on function public.booked_ranges(uuid, date) to anon, authenticated;

-- ── booking_contested: does another active booking share this slot/time? ─────
-- Drives the "sole claimant may self-serve upload" rule. True when at least
-- one OTHER non-cancelled booking overlaps this booking's court+date+range.
create or replace function public.booking_contested(p_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from bookings o, bookings me
    where me.id = p_id
      and o.id <> me.id
      and o.court_id = me.court_id
      and o.booking_date = me.booking_date
      and me.status <> 'cancelled'
      and o.status <> 'cancelled'
      and o.slot_minutes && me.slot_minutes
  );
$$;

grant execute on function public.booking_contested(uuid) to anon, authenticated;
