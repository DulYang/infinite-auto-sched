import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import {
  draftPaymentInstructionsMessage,
  draftAdminNotificationMessage,
} from "@/lib/bookings/template";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randBetween(minMs: number, maxMs: number) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}

// Gap before each ADMIN send. WAHA's documented anti-ban guidance is
// explicit: "wait a random time between 30 and 60 seconds" between
// consecutive messages — not a fixed interval, even for routine
// confirmations. The number was banned once for "suspicious spamming"
// while we sent with a fixed 1.5s gap; admin alerts now go out with
// randomized spacing matching that exact window. The delays run AFTER the
// HTTP response via next/server `after()`, so the booking flow is never
// slowed by them.
const ADMIN_GAP_MIN_MS = 30_000;
const ADMIN_GAP_MAX_MS = 60_000;
// If many admin numbers are configured, shrink the gaps so the total stays
// inside the function's execution budget (see maxDuration on the route).
// Sized so 1-2 admins (the common case) get the full 30-60s window; only
// 3+ admins compress it.
const ADMIN_TOTAL_BUDGET_MS = 150_000;

// Fires the two automatic notifications for a freshly-created booking.
// PRIORITY ORDER (deliberate):
//   1. Payment instructions to the CLIENT — sent first, inline, awaited.
//      This is the business-critical message.
//   2. New-booking alerts to admin numbers — scheduled in the background
//      (after the response is sent) with long randomized gaps between sends.
// Never throws — a notification failure must not break booking creation;
// failures are logged via log_whatsapp_message instead.
export async function notifyNewBooking(
  supabase: SupabaseClient,
  booking: {
    id: string;
    client_name: string;
    client_phone: string;
    booking_date: string;
    amount_due: number;
  },
  court: { name: string },
  slot: { start_time: string; end_time: string },
): Promise<void> {
  // If WAHA isn't configured yet, skip entirely rather than logging a false
  // "sent" — unlike the admin-approved manual send flow, there's no human
  // review step here to justify treating a no-op as a success.
  if (!process.env.WAHA_BASE_URL) return;

  try {
    await sendPaymentInstructions();
  } catch {
    // Defense in depth; sendOne already swallows most errors.
  }

  // Admin alerts continue after the HTTP response has been returned, so the
  // long anti-ban gaps cost the booking client nothing.
  after(async () => {
    try {
      await sendAdminAlerts();
    } catch {
      // Same: never let notification failures surface anywhere fatal.
    }
  });

  async function sendOne(recipient: string, text: string, messageType: string) {
    const result = await sendWhatsAppMessage(recipient, text);
    await supabase.rpc("log_whatsapp_message", {
      p_booking_id: booking.id,
      p_recipient_phone: recipient,
      p_message_body: text,
      p_message_type: messageType,
      p_send_status: result.ok ? "sent" : "failed",
      p_error_message: result.error ?? null,
    });
  }

  async function sendPaymentInstructions() {
    const bankName = process.env.BCA_BANK_NAME || "BCA";
    const accountNumber = process.env.BCA_ACCOUNT_NUMBER;
    const accountName = process.env.BCA_ACCOUNT_NAME;
    if (!accountNumber || !accountName) return;

    const text = draftPaymentInstructionsMessage({
      clientName: booking.client_name,
      courtName: court.name,
      startTime: slot.start_time,
      endTime: slot.end_time,
      bookingDate: booking.booking_date,
      amountDue: booking.amount_due,
      bankName,
      accountNumber,
      accountName,
    });

    await sendOne(booking.client_phone, text, "payment_instructions");
  }

  async function sendAdminAlerts() {
    const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (adminNumbers.length === 0) return;

    const gapMax = Math.min(
      ADMIN_GAP_MAX_MS,
      Math.floor(ADMIN_TOTAL_BUDGET_MS / adminNumbers.length),
    );
    const gapMin = Math.min(ADMIN_GAP_MIN_MS, Math.floor(gapMax * 0.6));

    for (let i = 0; i < adminNumbers.length; i++) {
      // Gap BEFORE every admin send — the first one also spaces the admin
      // alert away from the client message that just went out.
      await sleep(randBetween(gapMin, gapMax));
      const text = draftAdminNotificationMessage({
        clientName: booking.client_name,
        clientPhone: booking.client_phone,
        courtName: court.name,
        startTime: slot.start_time,
        endTime: slot.end_time,
        bookingDate: booking.booking_date,
        amountDue: booking.amount_due,
        // Rotate wording per recipient; offset by booking id so the same
        // admin doesn't always receive the same phrasing either.
        variant: i + (booking.id.charCodeAt(0) % 3),
      });
      await sendOne(adminNumbers[i], text, "admin_notification");
    }
  }
}
