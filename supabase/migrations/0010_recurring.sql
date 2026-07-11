-- Recurring bookings (weekly regulars).
--
-- A weekly series is generated as independent booking rows (one per week),
-- all sharing a recurrence_group_id so they can be recognized — and, later,
-- managed — as a set. Each row still stands on its own for confirmation,
-- cancellation, and the overlap/unique constraints.

alter table bookings add column if not exists recurrence_group_id uuid;

create index if not exists bookings_recurrence_group_idx
  on bookings (recurrence_group_id)
  where recurrence_group_id is not null;
