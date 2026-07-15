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

// Sent to the client automatically the moment they book, with bank transfer
// details so they can pay right away.
export function draftPaymentInstructionsMessage(params: {
  clientName: string;
  courtName: string;
  startTime: string;
  endTime: string;
  bookingDate: string;
  amountDue: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
}): string {
  const {
    clientName,
    courtName,
    startTime,
    endTime,
    bookingDate,
    amountDue,
    bankName,
    accountNumber,
    accountName,
  } = params;
  return `Hai ${clientName}! Terima kasih telah memesan ${courtName} pada ${formatDisplayDate(bookingDate)} pukul ${formatTime(startTime)}-${formatTime(endTime)}.

Total pembayaran: ${formatCurrency(amountDue)}
Silakan transfer ke:
${bankName} ${accountNumber}
a.n. ${accountName}

Setelah transfer, admin akan segera memverifikasi dan mengonfirmasi pemesanan Anda. Anda juga bisa mengunggah bukti transfer di halaman konfirmasi pemesanan Anda.`;
}

// Sent to admin WhatsApp numbers automatically the moment a client books, so
// admins know to watch for the incoming transfer.
export function draftAdminNotificationMessage(params: {
  clientName: string;
  clientPhone: string;
  courtName: string;
  startTime: string;
  endTime: string;
  bookingDate: string;
  amountDue: number;
}): string {
  const { clientName, clientPhone, courtName, startTime, endTime, bookingDate, amountDue } = params;
  return `🔔 Pemesanan baru!
Klien: ${clientName} (${clientPhone})
${courtName} — ${formatDisplayDate(bookingDate)} pukul ${formatTime(startTime)}-${formatTime(endTime)}
Jumlah: ${formatCurrency(amountDue)}
Status: Menunggu pembayaran`;
}
