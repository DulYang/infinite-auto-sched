-- Replace time slots with 2-hour blocks covering 8AM-10PM every day, and
-- switch pricing to a flat Rp 350,000 per booking. Existing bookings and
-- whatsapp_logs reference the old slot_ids via FK, so they're cleared first
-- (demo/seed data only, per docs/AGENTS.md).

delete from whatsapp_logs;
delete from bookings;
delete from time_slots;

insert into time_slots (id, label, start_time, end_time) values
  ('b3b2c3d4-0003-0001-0001-000000000001', '8AM - 10AM', '08:00', '10:00'),
  ('b3b2c3d4-0003-0001-0001-000000000002', '10AM - 12PM', '10:00', '12:00'),
  ('b3b2c3d4-0003-0001-0001-000000000003', '12PM - 2PM', '12:00', '14:00'),
  ('b3b2c3d4-0003-0001-0001-000000000004', '2PM - 4PM', '14:00', '16:00'),
  ('b3b2c3d4-0003-0001-0001-000000000005', '4PM - 6PM', '16:00', '18:00'),
  ('b3b2c3d4-0003-0001-0001-000000000006', '6PM - 8PM', '18:00', '20:00'),
  ('b3b2c3d4-0003-0001-0001-000000000007', '8PM - 10PM', '20:00', '22:00');

alter table bookings alter column amount_due set default 350000;
