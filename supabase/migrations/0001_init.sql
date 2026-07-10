create table if not exists courts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table courts enable row level security;
drop policy if exists "courts_v1_read" on courts;
create policy "courts_v1_read" on courts for select using (true);
drop policy if exists "courts_v1_write" on courts;
create policy "courts_v1_write" on courts for all using (true) with check (true);

create table if not exists time_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  label text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

alter table time_slots enable row level security;
drop policy if exists "time_slots_v1_read" on time_slots;
create policy "time_slots_v1_read" on time_slots for select using (true);
drop policy if exists "time_slots_v1_write" on time_slots;
create policy "time_slots_v1_write" on time_slots for all using (true) with check (true);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  court_id uuid references courts(id),
  slot_id uuid references time_slots(id),
  booking_date date not null,
  client_name text not null,
  client_phone text not null,
  status text not null default 'pending_payment',
  amount_due numeric not null default 500,
  payment_confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (court_id, slot_id, booking_date)
);

alter table bookings enable row level security;
drop policy if exists "bookings_v1_read" on bookings;
create policy "bookings_v1_read" on bookings for select using (true);
drop policy if exists "bookings_v1_write" on bookings;
create policy "bookings_v1_write" on bookings for all using (true) with check (true);

create table if not exists whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  booking_id uuid references bookings(id),
  recipient_phone text not null,
  message_body text not null,
  send_status text not null default 'pending',
  sent_at timestamptz,
  error_message text,
  message_draft text,
  message_draft_source text,
  message_draft_confidence numeric,
  message_draft_review_status text default 'unreviewed',
  created_at timestamptz not null default now()
);

alter table whatsapp_logs enable row level security;
drop policy if exists "whatsapp_logs_v1_read" on whatsapp_logs;
create policy "whatsapp_logs_v1_read" on whatsapp_logs for select using (true);
drop policy if exists "whatsapp_logs_v1_write" on whatsapp_logs;
create policy "whatsapp_logs_v1_write" on whatsapp_logs for all using (true) with check (true);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  performed_by text default 'admin',
  created_at timestamptz not null default now()
);

alter table audit_logs enable row level security;
drop policy if exists "audit_logs_v1_read" on audit_logs;
create policy "audit_logs_v1_read" on audit_logs for select using (true);
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_v1_write" on audit_logs for all using (true) with check (true);

insert into courts (id, name, description) values
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Main Basketball Court', 'Full-size indoor court with bleachers'),
  ('a1b2c3d4-0001-0001-0001-000000000002', 'Practice Half-Court', 'Smaller half-court for drills and practice');

insert into time_slots (id, label, start_time, end_time) values
  ('b1b2c3d4-0001-0001-0001-000000000001', 'Morning — 6AM to 8AM', '06:00', '08:00'),
  ('b1b2c3d4-0001-0001-0001-000000000002', 'Mid-Morning — 8AM to 10AM', '08:00', '10:00'),
  ('b1b2c3d4-0001-0001-0001-000000000003', 'Late Morning — 10AM to 12PM', '10:00', '12:00'),
  ('b1b2c3d4-0001-0001-0001-000000000004', 'Afternoon — 1PM to 3PM', '13:00', '15:00'),
  ('b1b2c3d4-0001-0001-0001-000000000005', 'Late Afternoon — 3PM to 5PM', '15:00', '17:00'),
  ('b1b2c3d4-0001-0001-0001-000000000006', 'Evening — 6PM to 8PM', '18:00', '20:00');

insert into bookings (id, court_id, slot_id, booking_date, client_name, client_phone, status, amount_due, payment_confirmed_at) values
  ('c1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0001-0001-0001-000000000001', current_date + 1, 'Juan dela Cruz', '+639171234567', 'confirmed', 500, now() - interval '2 hours'),
  ('c1b2c3d4-0001-0001-0001-000000000002', 'a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0001-0001-0001-000000000004', current_date + 1, 'Maria Santos', '+639281234567', 'pending_payment', 500, null),
  ('c1b2c3d4-0001-0001-0001-000000000003', 'a1b2c3d4-0001-0001-0001-000000000002', 'b1b2c3d4-0001-0001-0001-000000000006', current_date + 2, 'Carlo Reyes', '+639391234567', 'confirmed', 300, now() - interval '1 hour'),
  ('c1b2c3d4-0001-0001-0001-000000000004', 'a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0001-0001-0001-000000000003', current_date, 'Ana Lim', '+639501234567', 'completed', 500, now() - interval '5 hours');

insert into whatsapp_logs (booking_id, recipient_phone, message_body, send_status, sent_at, message_draft, message_draft_source, message_draft_confidence, message_draft_review_status) values
  ('c1b2c3d4-0001-0001-0001-000000000001', '+639171234567', 'Hi Juan! Your booking for Main Basketball Court on Morning 6AM-8AM slot has been confirmed. Amount paid: ₱500. See you there!', 'sent', now() - interval '2 hours', 'Hi Juan! Your booking for Main Basketball Court on Morning 6AM-8AM slot has been confirmed. Amount paid: ₱500. See you there!', 'template_engine', 0.99, 'approved'),
  ('c1b2c3d4-0001-0001-0001-000000000003', '+639391234567', 'Hi Carlo! Your booking for Practice Half-Court on Evening 6PM-8PM slot has been confirmed. Amount paid: ₱300. See you there!', 'sent', now() - interval '1 hour', 'Hi Carlo! Your booking for Practice Half-Court on Evening 6PM-8PM slot has been confirmed. Amount paid: ₱300. See you there!', 'template_engine', 0.99, 'approved');