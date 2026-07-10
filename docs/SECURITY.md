# Security

## Secret Handling
- WhatsApp API key and Twilio auth token stored as **Vercel environment variables** (server-side only)
- Never referenced in any client component or exposed via `/api` responses
- Supabase service role key used only in server-side API routes, never in `supabase-js` client

## Permission Model (v1 → lock-down)
- **v1:** RLS policies are permissive (open read/write) so the demo works without login. No sensitive client data in seed rows.
- **Sprint 4 lock-down:** Replace all permissive policies with `auth.uid() = user_id`. Gate `/admin` routes behind Supabase session middleware. `/book` (client form) stays public.
- Until Sprint 4 ships and is verified, do NOT put real client phone numbers or payment data into production.

## Approved Tools Rule
- Only named server-side tools may call external APIs: `send_whatsapp_message`, `draft_whatsapp_message`
- No `run_any` / `eval` / dynamic API construction permitted
- Every external call is logged to `whatsapp_logs` and `audit_logs` before returning to the client

## Audit Principle
- Every booking state change, payment confirmation, and WhatsApp send writes an `audit_logs` row
- Audit rows are insert-only; no update or delete route exists for `audit_logs`
- Admin UI shows last 50 audit entries; full history retained in DB

## Honest Gaps (stop and get help)
- Real payment gateway integration (GCash, PayMongo) requires PCI-aware review — do not DIY in v1
- If real client phone numbers are stored before Sprint 4 lock-down, treat the DB as sensitive and restrict Supabase project access immediately
