import { formatDisplayDate, formatTime } from "@/lib/bookings/date";
import { formatCurrency } from "@/lib/bookings/currency";

export function draftWhatsAppMessage(params: {
  clientName: string;
  courtName: string;
  startTime: string;
  endTime: string;
  bookingDate: string;
  amountDue: number;
}): string {
  const { clientName, courtName, startTime, endTime, bookingDate, amountDue } = params;
  return `Hai ${clientName}! Pemesanan Anda untuk ${courtName} pada ${formatDisplayDate(bookingDate)} pukul ${formatTime(startTime)}-${formatTime(endTime)} telah dikonfirmasi. Jumlah dibayar: ${formatCurrency(amountDue)}. Sampai jumpa di sana!`;
}
