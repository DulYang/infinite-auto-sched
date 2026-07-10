# Data Model

## courts
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid | nullable, owner-scoping at lock-down |
| name | text | e.g. "Main Basketball Court" |
| description | text | |
| created_at | timestamptz | |

## time_slots
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | nullable |
| label | text | e.g. "Morning — 6AM to 8AM" |
| start_time | time | |
| end_time | time | |
| created_at | timestamptz | |

## bookings
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | nullable |
| court_id | uuid FK → courts | |
| slot_id | uuid FK → time_slots | |
| booking_date | date | |
| client_name | text | |
| client_phone | text | e164 format |
| status | text | `pending_payment` \| `confirmed` \| `completed` |
| amount_due | numeric | |
| payment_confirmed_at | timestamptz | null until paid |
| notes | text | |
| created_at | timestamptz | |

**Constraint:** `unique(court_id, slot_id, booking_date)` — double-booking impossible at DB level.

## whatsapp_logs
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | nullable |
| booking_id | uuid FK → bookings | |
| recipient_phone | text | |
| message_body | text | final sent text |
| send_status | text | `pending` \| `sent` \| `failed` |
| sent_at | timestamptz | |
| error_message | text | |
| **message_draft** | text | AI-generated field |
| **message_draft_source** | text | e.g. `template_engine` |
| **message_draft_confidence** | numeric | 0–1 |
| **message_draft_review_status** | text | `unreviewed` \| `approved` \| `rejected` |
| created_at | timestamptz | |

## audit_logs
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | nullable |
| action | text | e.g. `booking.confirmed`, `whatsapp.sent` |
| entity_type | text | e.g. `booking` |
| entity_id | uuid | |
| details | jsonb | before/after snapshot |
| performed_by | text | admin name or `system` |
| created_at | timestamptz | |

## RLS
All tables: v1 permissive (read + write open for demo). Sprint 4 replaces with `auth.uid() = user_id` policies.
