import { formatDisplayDate, formatTime } from "@/lib/bookings/date";
import { formatCurrency } from "@/lib/bookings/currency";

export function draftWhatsAppMessage(params: {
  clientName: string;
  courtName: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  bookingDate: string;
  amountDue: number;
}): string {
  const { clientName, courtName, slotLabel, startTime, endTime, bookingDate, amountDue } = params;
  return `Hi ${clientName}! Your booking for ${courtName} on ${slotLabel} (${formatTime(startTime)}-${formatTime(endTime)}), ${formatDisplayDate(bookingDate)} is confirmed. Amount paid: ${formatCurrency(amountDue)}. See you there!`;
}
