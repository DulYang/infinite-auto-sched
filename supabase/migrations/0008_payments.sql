-- Payment tracking + gateway auto-verification scaffold.
--
-- Two paths write payments:
--   * Manual: the admin clicks "Mark Payment Received" (existing flow); the
--     API records a payments row as provider='manual'. Runs as the
--     authenticated admin, so ordinary RLS applies.
--   * Gateway (future): a signed webhook from the payment provider calls the
--     record_gateway_payment() security-definer RPC below, which records the
--     payment AND auto-confirms the booking without any admin action. This is
--     built now but stays inert until the webhook secret is configured (see
--     app_config + PAYMENT_WEBHOOK_SECRET env). No card/bank data is ever
--     handled by this app — the gateway does that and only sends us a signed
--     "paid" notification.

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  provider text not null default 'manual',        -- 'manual' | 'gcash' | 'bank_transfer' | ...
  provider_ref text,                              -- external transaction id / reference
  amount numeric not null,
  status text not null default 'pending',         -- 'pending' | 'paid' | 'failed'
  raw_payload jsonb,                              -- raw gateway event, for audit
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table payments enable row level security;
drop policy if exists "payments_admin_all" on payments;
create policy "payments_admin_all" on payments for all to authenticated using (true) with check (true);

-- Small config table so the gateway RPC can be secret-gated without a service
-- role key. Only authenticated admins can read/write it; anon has no policy,
-- so the secret is never exposed to the public API.
create table if not exists app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;
drop policy if exists "app_config_admin_all" on app_config;
create policy "app_config_admin_all" on app_config for all to authenticated using (true) with check (true);

-- Called by the (unauthenticated) payment webhook after it verifies the
-- provider's signature. Because it is granted to anon, it re-checks a shared
-- secret against app_config so it cannot be abused by arbitrary callers.
-- Records the payment and, if the booking is still pending, confirms it and
-- drafts the WhatsApp confirmation — mirroring the manual-confirm flow.
create or replace function public.record_gateway_payment(
  p_secret text,
  p_booking_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount numeric,
  p_payload jsonb,
  p_draft text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_booking bookings;
  v_payment_id uuid;
  v_log_id uuid;
  v_confirmed boolean := false;
begin
  select value into v_secret from app_config where key = 'payment_webhook_secret';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'unauthorized';
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'booking not found';
  end if;

  -- Idempotency: gateways may retry the same event. If we've already recorded
  -- a payment with this provider reference, do nothing and ack.
  if p_provider_ref is not null and exists (
    select 1 from payments
    where booking_id = p_booking_id and provider_ref = p_provider_ref
  ) then
    return jsonb_build_object('confirmed', false, 'status', v_booking.status, 'duplicate', true);
  end if;

  insert into payments (booking_id, provider, provider_ref, amount, status, raw_payload, paid_at)
  values (p_booking_id, p_provider, p_provider_ref, p_amount, 'paid', p_payload, now())
  returning id into v_payment_id;

  if v_booking.status = 'pending_payment' then
    update bookings
      set status = 'confirmed', payment_confirmed_at = now()
      where id = p_booking_id
      returning * into v_booking;
    v_confirmed := true;

    insert into audit_logs (action, entity_type, entity_id, details, performed_by)
    values ('booking.confirmed', 'booking', p_booking_id,
            jsonb_build_object('via', 'payment_gateway', 'provider', p_provider),
            'payment_gateway');

    insert into whatsapp_logs (booking_id, recipient_phone, message_body, send_status,
      message_draft, message_draft_source, message_draft_confidence, message_draft_review_status)
    values (p_booking_id, v_booking.client_phone, p_draft, 'pending',
      p_draft, 'template_engine', 0.99, 'unreviewed')
    returning id into v_log_id;

    insert into audit_logs (action, entity_type, entity_id, details, performed_by)
    values ('whatsapp.drafted', 'whatsapp_log', v_log_id,
            jsonb_build_object('booking_id', p_booking_id), 'system');
  end if;

  insert into audit_logs (action, entity_type, entity_id, details, performed_by)
  values ('payment.received', 'payment', v_payment_id,
          jsonb_build_object('provider', p_provider, 'ref', p_provider_ref, 'amount', p_amount),
          'payment_gateway');

  return jsonb_build_object('confirmed', v_confirmed, 'status', v_booking.status);
end;
$$;

grant execute on function public.record_gateway_payment(text, uuid, text, text, numeric, jsonb, text)
  to anon, authenticated;
