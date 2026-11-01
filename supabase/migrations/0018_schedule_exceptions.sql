-- Admin-managed schedule exceptions: close the court on certain dates, close
-- it for part of a day, or run special opening hours (e.g. the venue is
-- rented out / owner time off).
--
-- One row per exception. `mode` decides which minute ranges are BLOCKED:
--   closed_day     -> whole day            [0, 1440)
--   closed_range   -> [start_min, end_min)
--   special_hours  -> everything OUTSIDE [start_min, end_min) (open window)
-- Minutes are minutes-since-midnight, matching bookings.slot_minutes.

create table if not exists schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_date date not null,
  mode text not null check (mode in ('closed_day', 'closed_range', 'special_hours')),
  start_min int,
  end_min int,
  reason text,
  created_at timestamptz not null default now(),
  check (
    mode = 'closed_day'
    or (start_min is not null and end_min is not null
        and start_min >= 0 and end_min <= 1440 and start_min < end_min)
  )
);

create index if not exists schedule_exceptions_date_idx on schedule_exceptions (exception_date);

alter table schedule_exceptions enable row level security;
create policy "schedule_exceptions_admin_all" on schedule_exceptions
  for all to authenticated using (true) with check (true);

-- PII-free blocked ranges for a date (used by the public booking page).
create or replace function public.blocked_ranges(p_date date)
returns table(start_min int, end_min int, reason text)
language sql
security definer
set search_path = public
as $$
  select 0, 1440, e.reason from schedule_exceptions e
    where e.exception_date = p_date and e.mode = 'closed_day'
  union all
  select e.start_min, e.end_min, e.reason from schedule_exceptions e
    where e.exception_date = p_date and e.mode = 'closed_range'
  union all
  select 0, e.start_min, e.reason from schedule_exceptions e
    where e.exception_date = p_date and e.mode = 'special_hours' and e.start_min > 0
  union all
  select e.end_min, 1440, e.reason from schedule_exceptions e
    where e.exception_date = p_date and e.mode = 'special_hours' and e.end_min < 1440;
$$;

grant execute on function public.blocked_ranges(date) to anon, authenticated;

-- Hard guard: no new/moved active booking may overlap a blocked range.
-- Fires on INSERT and on UPDATEs that change slot or date, so confirming or
-- completing an already-existing booking is never blocked. This covers the
-- public form (create_booking), recurring series and admin reschedule.
create or replace function public.enforce_schedule_exceptions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start time;
  v_end time;
  v_range int4range;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  select start_time, end_time into v_start, v_end from time_slots where id = new.slot_id;
  if v_start is null then
    return new;
  end if;
  v_range := int4range(
    (extract(hour from v_start) * 60 + extract(minute from v_start))::int,
    (extract(hour from v_end) * 60 + extract(minute from v_end))::int
  );

  if exists (
    select 1 from public.blocked_ranges(new.booking_date) b
    where int4range(b.start_min, b.end_min) && v_range
  ) then
    raise exception 'Lapangan tutup pada waktu tersebut.' using errcode = 'BK001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_schedule_exceptions on bookings;
create trigger trg_enforce_schedule_exceptions
  before insert or update of slot_id, booking_date on bookings
  for each row execute function public.enforce_schedule_exceptions();
