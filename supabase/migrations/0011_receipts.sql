-- Online payment receipt upload by client.
--
-- The client uploads a payment proof (image/pdf) on their confirmation page.
-- Files live in a PRIVATE storage bucket: anyone (anon) may upload, but only
-- an authenticated admin may read them back (via a signed URL). The booking
-- row records the latest receipt path through a phone-gated RPC, mirroring
-- the cancel flow's ownership check.

-- Private bucket, 5MB cap, images + PDF only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

-- Storage policies. Anon may upload into the receipts bucket; only
-- authenticated admins may read/manage. (No anon SELECT, so clients can't
-- browse other people's receipts.)
drop policy if exists "receipts_anon_upload" on storage.objects;
create policy "receipts_anon_upload" on storage.objects
  for insert to anon with check (bucket_id = 'receipts');

drop policy if exists "receipts_admin_read" on storage.objects;
create policy "receipts_admin_read" on storage.objects
  for select to authenticated using (bucket_id = 'receipts');

drop policy if exists "receipts_admin_manage" on storage.objects;
create policy "receipts_admin_manage" on storage.objects
  for all to authenticated using (bucket_id = 'receipts') with check (bucket_id = 'receipts');

-- Record the uploaded receipt on the booking.
alter table bookings add column if not exists receipt_path text;

-- Client-facing: attach a receipt path, phone-gated to the booking owner.
create or replace function public.attach_receipt(p_id uuid, p_phone text, p_path text)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where id = p_id;
  if v_booking.id is null then
    raise exception 'booking not found';
  end if;
  if v_booking.client_phone <> p_phone then
    raise exception 'unauthorized';
  end if;

  update bookings set receipt_path = p_path where id = p_id returning * into v_booking;

  insert into audit_logs (action, entity_type, entity_id, details, performed_by)
  values ('receipt.uploaded', 'booking', p_id, jsonb_build_object('path', p_path), 'client');

  return v_booking;
end;
$$;

grant execute on function public.attach_receipt(uuid, text, text) to anon, authenticated;
