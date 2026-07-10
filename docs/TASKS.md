# Tasks & Sprints

## Sprint 1 — DB + Booking Engine
**Goal:** The core booking flow works end-to-end against the real database. App is demoable without login.

- [ ] Run migration SQL (courts, time_slots, bookings, whatsapp_logs, audit_logs + seed data)
- [ ] `/book` page: date picker + court selector + slot grid (available = green, taken = grey)
- [ ] Slot grid reads live from `bookings` table for selected date
- [ ] Booking form: client name, phone (e164 validation), date, court, slot → `POST /api/bookings`
- [ ] DB unique constraint blocks double-booking; API returns 409 with clear error message
- [ ] `/admin` page: table of all bookings (client name, court, date, slot, status) — no login required
- [ ] "Mark Payment Received" button → `PATCH /api/bookings/:id` → status `confirmed`, `payment_confirmed_at` stamped
- [ ] Audit log row written on booking create and on payment confirmation
- [ ] All screens: loading skeleton, empty state copy, error banner

**Definition of Done:** A fresh visitor can open `/book`, pick a slot, submit the form, and an admin on `/admin` can see it and mark it paid — all persisted to Supabase, visible after page refresh, with no dead buttons.

---

## Sprint 2 — WhatsApp Confirmation ← **v1 functional milestone**
**Goal:** Admin sends WhatsApp confirmation in one click. The full success scenario is usable.

- [ ] On booking `confirmed`: server auto-drafts message using booking data, inserts into `whatsapp_logs` with `review_status = unreviewed`
- [ ] Admin booking detail panel shows draft message text (editable)
- [ ] "Send WhatsApp" button → `POST /api/send-whatsapp` → calls Twilio/Meta API server-side
- [ ] On success: `send_status = sent`, `sent_at` stamped; badge shown on booking row
- [ ] On failure: `send_status = failed`, `error_message` stored; retry button shown
- [ ] WhatsApp API key stored only in Vercel env var; confirmed absent from client bundle
- [ ] Audit log row written on every send attempt

**Definition of Done:** Admin clicks "Mark Payment Received" → draft appears → admin clicks "Send" → client phone receives WhatsApp message → `whatsapp_logs` row shows `sent`. Error case: invalid phone → `failed` status shown in UI, no crash.

---

## Sprint 3 — Polish + Reliability
**Goal:** Zero rough edges before real clients use it.

- [ ] Booking confirmation page for client (shows court, slot, date after submit)
- [ ] Block booking form submission for past dates
- [ ] Admin filter: by date range, by status
- [ ] Phone number format enforced (e164) with inline error copy
- [ ] Audit log viewer in `/admin` (last 50 rows, human-readable action labels)
- [ ] Test all five screen states (loading, empty, partial data, error, ready) for `/book` and `/admin`

**Definition of Done:** All listed states are reachable and display correct copy. No console errors on normal flows. Audit log shows accurate history.

---

## Sprint 4 — Lock It Down
**Goal:** Admin data is protected before real client volume.

- [ ] Enable Supabase Auth; create admin account
- [ ] Replace permissive RLS policies with `auth.uid() = user_id` on bookings, whatsapp_logs, audit_logs
- [ ] `/admin` and `/api/*` routes reject unauthenticated requests (401 / redirect to `/login`)
- [ ] `/book` (client form) and `/api/bookings` POST remain public
- [ ] Verify no secrets in client bundle (Next.js build output check)
- [ ] Smoke-test full success scenario end-to-end after RLS change

**Definition of Done:** Unauthenticated request to `/admin` redirects to `/login`. Logged-in admin sees their bookings. Client booking form still works without login. RLS policy test confirms no cross-user data leak.

---

## Gantt (sprint → feature)
```
Sprint 1:  DB schema · Booking form · Slot grid · Admin table · Payment toggle · Audit log
Sprint 2:  WhatsApp draft · Send button · Send log · Error/retry  ← v1 functional
Sprint 3:  Client confirm page · Date validation · Admin filters · Audit viewer · State polish
Sprint 4:  Auth · RLS lock-down · Route guards · Security smoke test
```
