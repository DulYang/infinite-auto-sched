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
  return `Hai ${clientName}! Pemesanan Anda untuk ${courtName} pada ${slotLabel} (${formatTime(startTime)}-${formatTime(endTime)}), ${formatDisplayDate(bookingDate)} telah dikonfirmasi. Jumlah dibayar: ${formatCurrency(amountDue)}. Sampai jumpa di sana!`;
}
