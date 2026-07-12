import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { draftWhatsAppMessage } from "@/lib/bookings/template";
import type { Booking, Court, TimeSlot } from "@/lib/types";

// Payment gateway webhook — auto-verifies payment without any admin action.
//
// Stays INERT (503) until PAYMENT_WEBHOOK_SECRET is set, so it is safe in
// production before the gateway is connected. Setup:
//   1. Set PAYMENT_WEBHOOK_SECRET in Vercel env AND the matching
//      app_config 'payment_webhook_secret' row in Supabase (same value).
//   2. Point the provider's webhook at POST /api/payments/webhook.
//
// Two authentication modes are supported:
//
// ── Xendit (primary) ─────────────────────────────────────────────────────────
// Xendit sends its Webhook Verification Token in the `x-callback-token`
// header (a static token, compared verbatim — no HMAC). Use that token as
// PAYMENT_WEBHOOK_SECRET. Invoice callback payload (the fields we use):
//   { "id": "<xendit invoice id>", "external_id": "<our booking uuid>",
//     "status": "PAID" | "SETTLED" | "EXPIRED", "paid_amount": 350000,
//     "payment_channel": "GOPAY" | "BCA" | ... }
// The Xendit invoice MUST be created with external_id = the booking id so we
// can match the payment to the booking.
//
// ── Generic HMAC (fallback) ──────────────────────────────────────────────────
// For any custom/other gateway: HMAC-SHA256 hex over the raw body in the
// `x-signature` header, payload:
//   { "event": "payment.paid", "booking_id": "<uuid>", "amount": 350000,
//     "reference": "<txn id>", "provider": "gcash" }

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

type PaymentEvent = {
  bookingId: string;
  amount: number | null;
  reference: string | null;
  provider: string;
  raw: Record<string, unknown>;
};

// Returns the normalized paid-event, "ignored" for valid-but-irrelevant
// events (e.g. EXPIRED), or null for unauthorized/invalid requests.
function parseRequest(
  rawBody: string,
  headers: Headers,
  secret: string,
): PaymentEvent | "ignored" | null {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }

  // Xendit mode: static verification token in x-callback-token.
  const callbackToken = headers.get("x-callback-token");
  if (callbackToken !== null) {
    if (!timingSafeEqual(callbackToken, secret)) return null;

    const status = String(payload.status ?? "");
    const externalId = typeof payload.external_id === "string" ? payload.external_id : null;
    if (status !== "PAID" && status !== "SETTLED") return "ignored";
    if (!externalId) return "ignored";

    return {
      bookingId: externalId,
      amount: typeof payload.paid_amount === "number" ? payload.paid_amount : null,
      reference: typeof payload.id === "string" ? payload.id : null,
      provider: payload.payment_channel
        ? `xendit:${String(payload.payment_channel).toLowerCase()}`
        : "xendit",
      raw: payload,
    };
  }

  // Generic HMAC mode.
  const signature = headers.get("x-signature") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!/^[0-9a-f]+$/i.test(signature) || !timingSafeEqual(signature, expected)) return null;

  if (payload.event !== "payment.paid" || typeof payload.booking_id !== "string") {
    return "ignored";
  }

  return {
    bookingId: payload.booking_id,
    amount: typeof payload.amount === "number" ? payload.amount : null,
    reference: typeof payload.reference === "string" ? payload.reference : null,
    provider: typeof payload.provider === "string" ? payload.provider : "gateway",
    raw: payload,
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Payment webhook is not configured yet." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const parsed = parseRequest(rawBody, request.headers, secret);

  if (parsed === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (parsed === "ignored") {
    // Valid caller, but not a paid event we act on — ack so the gateway
    // doesn't retry.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = await createClient();

  // Fetch booking (admin-only table) via the public security-definer RPC,
  // plus court/slot from the publicly-readable tables, to build the draft.
  const { data: booking } = (await supabase.rpc("get_booking_by_id", {
    p_id: parsed.bookingId,
  })) as { data: Booking | null };

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const [{ data: court }, { data: slot }] = await Promise.all([
    supabase.from("courts").select("*").eq("id", booking.court_id).maybeSingle<Court>(),
    supabase.from("time_slots").select("*").eq("id", booking.slot_id).maybeSingle<TimeSlot>(),
  ]);

  const draft =
    court && slot
      ? draftWhatsAppMessage({
          clientName: booking.client_name,
          courtName: court.name,
          slotLabel: slot.label,
          startTime: slot.start_time,
          endTime: slot.end_time,
          bookingDate: booking.booking_date,
          amountDue: booking.amount_due,
        })
      : "";

  const { data, error } = await supabase.rpc("record_gateway_payment", {
    p_secret: secret,
    p_booking_id: booking.id,
    p_provider: parsed.provider,
    p_provider_ref: parsed.reference,
    p_amount: parsed.amount ?? booking.amount_due,
    p_payload: parsed.raw,
    p_draft: draft,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
