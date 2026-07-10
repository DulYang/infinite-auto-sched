# Agentic Layer

## Risk Levels & Actions

### Low Risk — Auto (no approval needed)
- Draft WhatsApp confirmation message from booking data (`template_engine`)
- Tag booking status on form submit (`pending_payment`)
- Write audit log entry on every state change

### Medium Risk — Light Approval (admin clicks confirm)
- Update booking status → `confirmed` after admin marks payment received
- Update booking status → `completed` after session date passes

### High Risk — Always Requires Admin Approval ✋
- **Send WhatsApp message** to client phone — admin must review draft and click "Send"
- Tool: `send_whatsapp_message(booking_id, recipient_phone, message_body)`
- Draft shown in UI; send only fires after explicit approval
- Result (sent/failed) logged immediately to `whatsapp_logs`

### Critical — Human Only 🚫
- Delete a booking record
- Refund or reverse a payment confirmation
- Bulk-delete audit logs

## Named Tools (server-side only)
| Tool | Trigger | Output |
|---|---|---|
| `draft_whatsapp_message` | booking confirmed | message draft in whatsapp_logs |
| `send_whatsapp_message` | admin approves draft | WhatsApp API call + log |
| `write_audit_log` | any state change | audit_logs row |

## Audit Log Fields (per action)
`action`, `entity_type`, `entity_id`, `details (jsonb before/after)`, `performed_by`, `created_at`

## v1 vs Later
- **v1:** Draft + send WhatsApp (high-risk, approval required)
- **Later:** Auto-send on payment confirm if admin enables it (toggle in settings)
