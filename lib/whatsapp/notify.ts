import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import {
  draftPaymentInstructionsMessage,
  draftAdminNotificationMessage,
} from "@/lib/bookings/template";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gap between individual WAHA sends. Firing several messages at once (client
// + multiple admins via Promise.all) got rejected with a bare, message-less
// 403 in testing — the signature of a burst/rate-limit guard (WAHA's own or
// a WAF in front of it) — while sending one at a time worked reliably.
const SEND_GAP_MS = 1500;

// Fires the two automatic notifications for a freshly-created booking:
// payment instructions to the client, and a new-booking alert to admin
// WhatsApp numbers. Sent SEQUENTIALLY, not concurrently (see SEND_GAP_MS).
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
    await sleep(SEND_GAP_MS);
    await sendAdminAlerts();
  } catch {
    // Defense in depth; the inner calls already swallow their own errors.
  }

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

    const text = draftAdminNotificationMessage({
      clientName: booking.client_name,
      clientPhone: booking.client_phone,
      courtName: court.name,
      startTime: slot.start_time,
      endTime: slot.end_time,
      bookingDate: booking.booking_date,
      amountDue: booking.amount_due,
    });

    for (let i = 0; i < adminNumbers.length; i++) {
      await sendOne(adminNumbers[i], text, "admin_notification");
      if (i < adminNumbers.length - 1) await sleep(SEND_GAP_MS);
    }
  }
}
