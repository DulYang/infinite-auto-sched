import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import {
  draftPaymentInstructionsMessage,
  draftAdminNotificationMessage,
} from "@/lib/bookings/template";

// Fires the two automatic notifications for a freshly-created booking:
// payment instructions to the client, and a new-booking alert to admin
// WhatsApp numbers. Never throws — a notification failure must not break
// booking creation; failures are logged via log_whatsapp_message instead.
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
    await Promise.all([sendPaymentInstructions(), sendAdminAlerts()]);
  } catch {
    // Defense in depth; the inner calls already swallow their own errors.
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

    const result = await sendWhatsAppMessage(booking.client_phone, text);
    await supabase.rpc("log_whatsapp_message", {
      p_booking_id: booking.id,
      p_recipient_phone: booking.client_phone,
      p_message_body: text,
      p_message_type: "payment_instructions",
      p_send_status: result.ok ? "sent" : "failed",
      p_error_message: result.error ?? null,
    });
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

    await Promise.all(
      adminNumbers.map(async (number) => {
        const result = await sendWhatsAppMessage(number, text);
        await supabase.rpc("log_whatsapp_message", {
          p_booking_id: booking.id,
          p_recipient_phone: number,
          p_message_body: text,
          p_message_type: "admin_notification",
          p_send_status: result.ok ? "sent" : "failed",
          p_error_message: result.error ?? null,
        });
      }),
    );
  }
}
