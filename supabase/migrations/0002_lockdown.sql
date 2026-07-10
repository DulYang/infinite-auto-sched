-- Sprint 4: replace permissive v1 policies with authenticated-admin lock-down.
-- /book (public booking form) keeps working without login; /admin data becomes
-- readable/writable only by an authenticated admin session.

-- courts: public can read (needed for the booking form court selector);
-- only an authenticated admin can manage them.
drop policy if exists "courts_v1_read" on courts;
drop policy if exists "courts_v1_write" on courts;
create policy "courts_public_read" on courts for select using (true);
create policy "courts_admin_insert" on courts for insert to authenticated with check (true);
create policy "courts_admin_update" on courts for update to authenticated using (true) with check (true);
create policy "courts_admin_delete" on courts for delete to authenticated using (true);

-- time_slots: same shape as courts.
drop policy if exists "time_slots_v1_read" on time_slots;
drop policy if exists "time_slots_v1_write" on time_slots;
create policy "time_slots_public_read" on time_slots for select using (true);
create policy "time_slots_admin_insert" on time_slots for insert to authenticated with check (true);
create policy "time_slots_admin_update" on time_slots for update to authenticated using (true) with check (true);
create policy "time_slots_admin_delete" on time_slots for delete to authenticated using (true);

-- bookings: anyone can submit a new pending booking (the public /book form);
-- reading, confirming, and completing bookings requires an authenticated admin.
drop policy if exists "bookings_v1_read" on bookings;
drop policy if exists "bookings_v1_write" on bookings;
create policy "bookings_admin_read" on bookings for select to authenticated using (true);
create policy "bookings_public_insert" on bookings for insert with check (status = 'pending_payment');
create policy "bookings_admin_update" on bookings for update to authenticated using (true) with check (true);
create policy "bookings_admin_delete" on bookings for delete to authenticated using (true);

-- whatsapp_logs: admin-only end to end (drafts are created by the server on
-- confirm, sends are admin-approved actions).
drop policy if exists "whatsapp_logs_v1_read" on whatsapp_logs;
drop policy if exists "whatsapp_logs_v1_write" on whatsapp_logs;
create policy "whatsapp_logs_admin_all" on whatsapp_logs for all to authenticated using (true) with check (true);

-- audit_logs: insert-only is allowed from any request (the public booking
-- flow writes a "booking.created" row before an admin ever logs in); reading
-- history requires an authenticated admin. No update/delete policy exists.
drop policy if exists "audit_logs_v1_read" on audit_logs;
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_admin_read" on audit_logs for select to authenticated using (true);
create policy "audit_logs_system_insert" on audit_logs for insert with check (true);

-- Public, PII-safe slot-availability lookup. The /book page needs to know
-- which slots are taken for a given court/date, but must never see client
-- names or phone numbers (bookings SELECT is now admin-only). This function
-- runs as security definer to bypass RLS and returns only slot_id.
create or replace function public.taken_slot_ids(p_court_id uuid, p_date date)
returns table(slot_id uuid)
language sql
security definer
set search_path = public
as $$
  select b.slot_id from bookings b where b.court_id = p_court_id and b.booking_date = p_date;
$$;

grant execute on function public.taken_slot_ids(uuid, date) to anon, authenticated;
