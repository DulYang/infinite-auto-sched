# Intelligence Layer

## Messy Input
Admin used to type WhatsApp messages by hand — inconsistent wording, missing details, occasional wrong slot times.

## What Gets Auto-Structured (v1)
When a booking is confirmed, the system fills a message template deterministically:

```json
{
  "recipient": "+639171234567",
  "draft": "Hi Juan! Your booking for Main Basketball Court on 6AM–8AM, July 14 is confirmed. Amount paid: ₱500. See you there!",
  "source": "template_engine",
  "confidence": 0.99,
  "review_status": "unreviewed"
}
```

Fields pulled: `client_name`, `court.name`, `time_slot.label`, `booking_date`, `amount_due`.

## Events to Track
- Booking created
- Payment marked received
- WhatsApp draft generated
- Draft approved / edited by admin
- Message sent / failed

## Scoring Rules (v1 — rule-based)
| Signal | Score |
|---|---|
| All booking fields present | confidence = 0.99 |
| Phone in e164 format | send allowed |
| Phone format invalid | send blocked, error shown |

## v1 vs Later
- **v1:** Deterministic template; no LLM needed
- **Next:** Detect returning clients by phone, pre-fill name
- **Later:** LLM-personalised message tone; smart slot suggestions based on booking history
