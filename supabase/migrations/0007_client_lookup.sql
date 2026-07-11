-- Recognize returning clients by phone number.
--
-- Bookings SELECT is admin-only (locked down in 0002/0004), so the public
-- booking form can't read the bookings table to pre-fill a returning client's
-- name. This security-definer function exposes ONLY the client name for an
-- exact phone match (no other booking data), so the /book form can offer a
-- convenience pre-fill without opening up the bookings table.
--
-- Privacy note: this lets anyone who already knows a full phone number learn
-- the name last associated with it. That is an intentional, narrow trade-off
-- for the returning-client convenience; no other PII is exposed.

create or replace function public.lookup_client_name(p_phone text)
returns text
language sql
security definer
set search_path = public
as $$
  select client_name
  from bookings
  where client_phone = p_phone
  order by created_at desc
  limit 1;
$$;

grant execute on function public.lookup_client_name(text) to anon, authenticated;
