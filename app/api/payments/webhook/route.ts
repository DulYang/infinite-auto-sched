import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { draftWhatsAppMessage } from "@/lib/bookings/template";
import type { Booking, Court, TimeSlot } from "@/lib/types";

// Payment gateway webhook — auto-verifies payment without any admin action.
//
// This is built and ready but stays INERT until PAYMENT_WEBHOOK_SECRET is set
// (returns 503 otherwise), so it is safe to ship before the bank/gateway is
// connected. When the gateway is wired up later:
//   1. Set PAYMENT_WEBHOOK_SECRET in Vercel env (and the matching
//      app_config 'payment_webhook_secret' row in Supabase).
//   2. Point the provider's webhook at POST /api/payments/webhook.
//   3. Adapt the parsing/signature scheme below to the provider's format.
//
// Expected payload (until adapted to the real provider):
//   { "event": "payment.paid", "booking_id": "<uuid>", "amount": 350000,
//     "reference": "<gateway txn id>", "provider": "gcash" }
// signed with HMAC-SHA256 over the raw body, hex, in the `x-signature` header.

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
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
  const signature = request.headers.get("x-signature") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  if (!timingSafeEqualHex(signature, expected)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    event?: string;
    booking_id?: string;
    amount?: number;
    reference?: string;
    provider?: string;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Acknowledge unrelated events without acting on them.
  if (event.event !== "payment.paid" || !event.booking_id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = await createClient();

  // Fetch booking (admin-only table) via the public security-definer RPC,
  // plus court/slot from the publicly-readable tables, to build the draft.
  const { data: booking } = (await supabase.rpc("get_booking_by_id", {
    p_id: event.booking_id,
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
    p_provider: event.provider ?? "gateway",
    p_provider_ref: event.reference ?? null,
    p_amount: event.amount ?? booking.amount_due,
    p_payload: event,
    p_draft: draft,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
