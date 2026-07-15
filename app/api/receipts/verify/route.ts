import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { extractReceiptFields } from "@/lib/receipts/ocr";
import { validateReceipt, jakartaDate } from "@/lib/receipts/validate";
import { writeAuditLog } from "@/lib/bookings/audit";
import { draftWhatsAppMessage } from "@/lib/bookings/template";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { isValidE164 } from "@/lib/bookings/phone";

// Vision OCR + rules can take several seconds; give it room on Vercel.
export const maxDuration = 60;

// Anon-facing (phone-gated) auto-verification of a client's uploaded payment
// proof. Runs the receipt through Claude vision, checks amount / BCA account
// number / recipient name / date-not-past against the booking, and — if all
// pass — auto-confirms the booking and sends the WhatsApp confirmation, exactly
// like an admin manually confirming. Any failure (unconfigured, illegible, a
// mismatch, an API error) is a no-op that leaves the booking for manual review.
//
// SECURITY NOTE: OCR of a user-supplied image is spoofable — a forged receipt
// with the right numbers can pass. This is a convenience filter, not proof of
// funds; manual admin review remains the backstop and the tamper-proof path is
// the payment-gateway webhook (record_gateway_payment).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  const phone = typeof body?.phone === "string" ? body.phone : null;
  if (!id || !phone) {
    return NextResponse.json({ error: "id dan phone wajib diisi." }, { status: 400 });
  }

  // Inert until fully configured: needs the service-role key (to read the
  // private receipt + write the confirmation) and an Anthropic key (vision),
  // plus the BCA details to validate against. Missing any → manual review.
  const supabase = createServiceClient();
  const accountNumber = process.env.BCA_ACCOUNT_NUMBER;
  const accountName = process.env.BCA_ACCOUNT_NAME;
  if (!supabase || !process.env.ANTHROPIC_API_KEY || !accountNumber || !accountName) {
    return NextResponse.json({ verified: false, manualReview: true, reason: "not_configured" });
  }

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("*, court:courts(*), slot:time_slots(*)")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Pemesanan tidak ditemukan." }, { status: 404 });
  }
  // Ownership check mirrors the cancel/attach flows — the caller must know the
  // phone on the booking (they just entered it), not just the unguessable id.
  if (booking.client_phone !== phone) {
    return NextResponse.json({ error: "Tidak diotorisasi" }, { status: 403 });
  }

  if (booking.status === "confirmed") {
    return NextResponse.json({ verified: true, alreadyConfirmed: true });
  }
  if (booking.status !== "pending_payment") {
    return NextResponse.json({ verified: false, manualReview: false, reason: "not_pending" });
  }
  if (!booking.receipt_path) {
    return NextResponse.json({ error: "Belum ada bukti pembayaran." }, { status: 400 });
  }

  // ── Read the proof out of the private bucket ────────────────────────────────
  let base64: string;
  let mediaType: string;
  try {
    const { data: blob, error: dlError } = await supabase.storage
      .from("receipts")
      .download(booking.receipt_path);
    if (dlError || !blob) throw new Error(dlError?.message || "download failed");

    mediaType = blob.type || mimeFromPath(booking.receipt_path);
    const buf = Buffer.from(await blob.arrayBuffer());
    base64 = buf.toString("base64");
  } catch {
    return NextResponse.json({ verified: false, manualReview: true, reason: "download_failed" });
  }

  // ── Extract + validate ──────────────────────────────────────────────────────
  const today = jakartaDate();
  const earliest = jakartaDate(new Date(booking.created_at));
  let result;
  let extracted;
  try {
    extracted = await extractReceiptFields(base64, mediaType);
    result = validateReceipt(extracted, {
      amountDue: booking.amount_due,
      accountNumber,
      accountName,
      // A legit transfer can't predate the booking or be in the future.
      earliestDate: earliest <= today ? earliest : today,
      latestDate: today,
    });
  } catch {
    // Vision/transport failure — never block the client, fall back to admin.
    return NextResponse.json({ verified: false, manualReview: true, reason: "ocr_error" });
  }

  if (!result.valid) {
    await writeAuditLog(supabase, {
      action: "receipt.verification_failed",
      entityType: "booking",
      entityId: booking.id,
      details: { checks: result.checks, extracted },
      performedBy: "system",
    });
    return NextResponse.json({ verified: false, manualReview: true, checks: result.checks });
  }

  // ── All four checks passed → auto-confirm ───────────────────────────────────
  // The status guard on the UPDATE makes this idempotent and race-safe: only the
  // request that flips pending_payment → confirmed proceeds to pay + notify, so
  // concurrent verify calls can't double-confirm or double-send.
  const { data: confirmed, error: updateError } = await supabase
    .from("bookings")
    .update({ status: "confirmed", payment_confirmed_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!confirmed) {
    // Lost the race — someone/something already confirmed it.
    return NextResponse.json({ verified: true, alreadyConfirmed: true });
  }

  await supabase.from("payments").insert({
    booking_id: booking.id,
    provider: "receipt_ocr",
    amount: booking.amount_due,
    status: "paid",
    paid_at: new Date().toISOString(),
    raw_payload: { extracted, checks: result.checks },
  });

  await writeAuditLog(supabase, {
    action: "receipt.verified",
    entityType: "booking",
    entityId: booking.id,
    details: { amount: booking.amount_due, extracted },
    performedBy: "system",
  });
  await writeAuditLog(supabase, {
    action: "payment.received",
    entityType: "booking",
    entityId: booking.id,
    details: { provider: "receipt_ocr", amount: booking.amount_due },
    performedBy: "system",
  });

  // ── Send the WhatsApp confirmation (same message as the admin flow) ──────────
  if (booking.court && booking.slot) {
    const text = draftWhatsAppMessage({
      clientName: booking.client_name,
      courtName: booking.court.name,
      startTime: booking.slot.start_time,
      endTime: booking.slot.end_time,
      bookingDate: booking.booking_date,
      amountDue: booking.amount_due,
    });
    const send = await sendWhatsAppMessage(booking.client_phone, text);
    await supabase.from("whatsapp_logs").insert({
      booking_id: booking.id,
      recipient_phone: booking.client_phone,
      message_body: text,
      send_status: send.ok ? "sent" : "failed",
      sent_at: send.ok ? new Date().toISOString() : null,
      error_message: send.error ?? null,
      message_draft: text,
      message_draft_source: "template_engine",
      message_draft_confidence: isValidE164(booking.client_phone) ? 0.99 : 0.5,
      message_draft_review_status: "approved",
      message_type: "confirmation",
    });
    await writeAuditLog(supabase, {
      action: send.ok ? "whatsapp.sent" : "whatsapp.failed",
      entityType: "booking",
      entityId: booking.id,
      details: { message_type: "confirmation", via: "receipt_auto_verify", error: send.error ?? null },
      performedBy: "system",
    });
  }

  return NextResponse.json({ verified: true, confirmed: true });
}

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
