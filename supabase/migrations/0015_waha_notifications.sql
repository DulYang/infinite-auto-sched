-- Switch to WAHA (self-hosted WhatsApp HTTP API on a real WA number) and add
-- two new automatic notifications sent the moment a booking is created:
--   1. Payment instructions (BCA transfer info) to the client.
--   2. A new-booking alert to one or more admin WhatsApp numbers.
-- Both are logged for a full audit trail, distinguished from the existing
-- post-confirmation "confirmation" message via message_type.

alter table whatsapp_logs add column if not exists message_type text not null default 'confirmation';
-- values: 'confirmation' | 'payment_instructions' | 'admin_notification'

-- Public clients have no INSERT access to whatsapp_logs (admin-only per
-- 0002). This lets the public booking-creation route log the two automatic
-- notification types without opening the table itself to anon. Restricted
-- to those two types so it can't be used to fabricate a fake 'confirmation'
-- (sent) row for a booking that was never actually confirmed by an admin.
create or replace function public.log_whatsapp_message(
  p_booking_id uuid,
  p_recipient_phone text,
  p_message_body text,
  p_message_type text,
  p_send_status text,
  p_error_message text default null
)
returns whatsapp_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log whatsapp_logs;
begin
  if p_message_type not in ('payment_instructions', 'admin_notification') then
    raise exception 'invalid message_type for log_whatsapp_message';
  end if;
  if p_send_status not in ('sent', 'failed') then
    raise exception 'invalid send_status for log_whatsapp_message';
  end if;

  insert into whatsapp_logs (
    booking_id, recipient_phone, message_body, send_status, sent_at,
    message_draft, message_draft_source, message_draft_confidence,
    message_draft_review_status, message_type, error_message
  ) values (
    p_booking_id, p_recipient_phone, p_message_body, p_send_status,
    case when p_send_status = 'sent' then now() else null end,
    p_message_body, 'template_engine', 0.99, 'approved',
    p_message_type, p_error_message
  )
  returning * into v_log;

  insert into audit_logs (action, entity_type, entity_id, details, performed_by)
  values (
    case when p_send_status = 'sent' then 'whatsapp.sent' else 'whatsapp.failed' end,
    'whatsapp_log', v_log.id,
    jsonb_build_object('booking_id', p_booking_id, 'message_type', p_message_type),
    'system'
  );

  return v_log;
end;
$$;

grant execute on function public.log_whatsapp_message(uuid, text, text, text, text, text)
  to anon, authenticated;
