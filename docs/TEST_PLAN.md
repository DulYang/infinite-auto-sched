# Test Plan

## Success Scenario (manual walkthrough)
1. Open `/book` — slot grid loads for today's date; seeded taken slots show grey
2. Pick tomorrow, select "Main Basketball Court", select "Afternoon 1PM–3PM" (available)
3. Enter name: `Test Client`, phone: `+639991234567`, submit
4. **Expected:** Confirmation page shows court + slot + date. DB row in `bookings` with `status = pending_payment`
5. Open `/admin` — new booking row visible at top
6. Click "Mark Payment Received" on that row
7. **Expected:** Status badge flips to `confirmed`. `payment_confirmed_at` set. Audit log row created.
8. Open booking detail — WhatsApp draft message visible with correct name, court, slot, date, amount
9. Click "Send WhatsApp"
10. **Expected:** `whatsapp_logs` row: `send_status = sent`, `sent_at` populated. Booking row shows "Sent" badge.

## Empty State Tests
- Open `/book` for a date with no bookings → all slots show green (available)
- Open `/admin` with no bookings in DB → empty state copy: "No bookings yet. Share the booking link with your clients."

## Error / Edge Cases
| Scenario | Expected Behaviour |
|---|---|
| Client picks already-taken slot | Submit returns 409; form shows "This slot is already taken. Please choose another." |
| Client submits with invalid phone (e.g. `09991234567`) | Inline error: "Enter phone in international format, e.g. +63999..." |
| Client picks a past date | Date picker blocks it; submit disabled |
| WhatsApp API call fails (bad token) | `send_status = failed`, error message shown, retry button active; no crash |
| Admin refreshes page after marking payment | `confirmed` status persists (server-derived, not local state) |

## Checks Before Marking Sprint Done
- [ ] No dead buttons (every clickable element triggers a real DB action)
- [ ] No seed-data-only screens (admin can create, edit, delete bookings via UI)
- [ ] WhatsApp API key not found in browser network tab or JS bundle
- [ ] Audit log has a row for every action taken during test walkthrough
- [ ] All five screen states reachable on `/book` and `/admin`
