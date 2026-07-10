# PRD — Infinite Auto Sched

## Problem
Clients call or message to book a basketball court. The admin manually checks availability, collects payment proof, and sends confirmation — a slow, error-prone chain that breaks when the admin is busy.

## Target User
The admin team managing one (or two) basketball courts for a court-rental business.

## Core Objects
- **Court** — the rentable space
- **Time Slot** — fixed time blocks per day (e.g., 6AM–8AM)
- **Booking** — a client's reservation of a court + slot + date, with payment status
- **WhatsApp Log** — record of every confirmation message drafted and sent
- **Audit Log** — immutable record of every meaningful admin action

## MVP Must-Haves (v1 checklist)
- [ ] Public booking form: client picks court, date, time slot, enters name and phone
- [ ] Slot availability enforced at DB level (no double-booking possible)
- [ ] Admin dashboard: list all bookings with status (pending payment / confirmed / completed)
- [ ] Admin "Mark Payment Received" button → booking flips to `confirmed`
- [ ] On confirmation: auto-draft WhatsApp message; admin reviews and sends in one click
- [ ] WhatsApp send is logged (sent, failed, pending) and visible on the booking row
- [ ] All screens handle loading, empty, partial, and error states

## Non-Goals (v1)
- Cancellation or rescheduling by client
- Online payment gateway (payment verified manually by admin)
- Multi-user admin logins / per-user data isolation (Sprint 4)
- Multiple court locations
- Recurring / weekly bookings

## Success Criteria
**Pass:** A new client submits the booking form → admin sees the booking as `pending_payment` → admin clicks "Mark Payment Received" → booking flips to `confirmed` → WhatsApp draft appears → admin clicks "Send" → client receives WhatsApp message with slot details → log row shows `sent`. This whole flow completes without any spreadsheet or manual message typing.
