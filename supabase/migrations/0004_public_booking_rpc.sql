-- Fix: Postgres RLS requires a SELECT policy for the calling role whenever
-- INSERT ... RETURNING is used (supabase-js .insert().select() does this
-- implicitly). Since bookings SELECT is now authenticated-only (0002), the
-- public /book form's insert-and-return-the-new-row call was failing with
-- "new row violates row-level security policy" for anon, even though the
-- WITH CHECK condition itself was satisfied.
--
-- Fix: move public booking creation and the public booking-confirmation
-- lookup behind narrow, security-definer RPCs (same pattern as
-- taken_slot_ids), and lock the bookings table itself down to
-- authenticated-only for every direct operation.

drop policy if exists "bookings_public_insert" on bookings;
create policy "bookings_admin_insert" on bookings for insert to authenticated with check (true);

-- Creates a booking on behalf of an anonymous client. Status is hardcoded to
-- 'pending_payment' here (not trusting caller input) so this can never be
-- used to insert a pre-confirmed booking.
create or replace function public.create_booking(
  p_court_id uuid,
  p_slot_id uuid,
  p_booking_date date,
  p_client_name text,
  p_client_phone text,
  p_notes text,
  p_amount_due numeric
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  insert into bookings (court_id, slot_id, booking_date, client_name, client_phone, status, amount_due, notes)
  values (p_court_id, p_slot_id, p_booking_date, p_client_name, p_client_phone, 'pending_payment', p_amount_due, p_notes)
  returning * into v_booking;
  return v_booking;
end;
$$;

grant execute on function public.create_booking(uuid, uuid, date, text, text, text, numeric) to anon, authenticated;

-- Lets the client who just booked look up their own booking by id (an
-- unguessable uuid) on the public confirmation page, without granting
-- general SELECT access to the bookings table.
create or replace function public.get_booking_by_id(p_id uuid)
returns bookings
language sql
security definer
set search_path = public
as $$
  select * from bookings where id = p_id;
$$;

grant execute on function public.get_booking_by_id(uuid) to anon, authenticated;
