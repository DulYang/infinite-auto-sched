# Architecture

## Stack
- **Frontend:** Next.js 14 (App Router) on Vercel
- **Database + Auth:** Supabase (Postgres, RLS, Auth for Sprint 4)
- **WhatsApp:** Twilio WhatsApp API or Meta Cloud API (server-side only)
- **Hosting:** Vercel (env vars stored as Vercel secrets, never in client bundle)

## What to Build Now vs Later
| Now (v1) | Later |
|---|---|
| Booking form + slot grid | Payment gateway auto-verification |
| Admin dashboard (no login) | Client self-service reschedule |
| Payment confirmation toggle | Multi-court / multi-location |
| WhatsApp draft + send (admin-approved) | Recurring bookings |
| Audit log | Per-user login + RLS lock-down |

## Key User Action — Step by Step
1. Client opens `/book`, sees available slots for a chosen date
2. Client submits form → `POST /api/bookings` → row inserted into `bookings` table with status `pending_payment`
3. Admin opens `/admin`, sees new booking row
4. Admin clicks "Mark Payment Received" → `PATCH /api/bookings/:id` → status → `confirmed`, `payment_confirmed_at` stamped
5. App auto-drafts WhatsApp message from booking data → stored in `whatsapp_logs` with `review_status = unreviewed`
6. Admin reviews draft in booking detail panel → clicks "Send"
7. Server calls WhatsApp API → on success, `send_status = sent`, `sent_at` stamped; on failure, `send_status = failed` with error surfaced
8. Audit log row written for every state change

## Layer Plan
1. **Data first** — schema + constraints + seed data
2. **App logic** — booking CRUD, status transitions, no-overlap enforcement
3. **Smart features** — WhatsApp message templating (rule-based, no LLM needed in v1)

## Core Runs Without AI
Message drafting uses a deterministic template (name, court, slot, date, amount). The entire booking + confirmation flow works if the WhatsApp API is replaced with a copy-paste panel.
