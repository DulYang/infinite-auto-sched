import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDisplayDate, formatTime } from "@/lib/bookings/date";
import { formatCurrency } from "@/lib/bookings/currency";
import type { Booking, Court, TimeSlot } from "@/lib/types";
import CancelBookingButton from "./CancelBookingButton";

export default async function BookingConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Bookings SELECT is admin-only; a just-booked client looks up their own
  // booking (by unguessable uuid) through this security-definer RPC instead.
  const { data: booking } = (await supabase.rpc("get_booking_by_id", {
    p_id: id,
  })) as { data: Booking | null };

  if (!booking) {
    notFound();
  }

  const [{ data: court }, { data: slot }] = await Promise.all([
    supabase.from("courts").select("*").eq("id", booking.court_id).maybeSingle<Court>(),
    supabase.from("time_slots").select("*").eq("id", booking.slot_id).maybeSingle<TimeSlot>(),
  ]);

  const isCancelled = booking.status === "cancelled";

  return (
    <div className="max-w-lg mx-auto px-4 py-6 sm:py-10">
      {isCancelled ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center">
          <div className="text-4xl mb-2">❌</div>
          <h1 className="text-xl font-bold text-red-900">Pemesanan Dibatalkan</h1>
          <p className="text-red-800 text-sm mt-1">
            Pemesanan ini telah dibatalkan. Silakan pesan slot lain bila diperlukan.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
          <div className="text-4xl mb-2">✅</div>
          <h1 className="text-xl font-bold text-emerald-900">Pemesanan Terkirim</h1>
          <p className="text-emerald-800 text-sm mt-1">
            Kami telah menerima permintaan Anda. Admin akan mengonfirmasi setelah pembayaran diverifikasi.
          </p>
        </div>
      )}

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white text-sm">
        <Row label="Lapangan" value={court?.name ?? "—"} />
        <Row label="Slot Waktu" value={slot?.label ?? "—"} />
        <Row
          label="Waktu"
          value={slot ? `${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}` : "—"}
        />
        <Row label="Tanggal" value={formatDisplayDate(booking.booking_date)} />
        <Row label="Nama" value={booking.client_name} />
        <Row label="Telepon" value={booking.client_phone} />
        <Row label="Jumlah Tagihan" value={formatCurrency(booking.amount_due)} />
        <Row label="Status" value={<StatusBadge status={booking.status} />} />
      </dl>

      {(booking.status === "pending_payment" || booking.status === "confirmed") && (
        <CancelBookingButton bookingId={booking.id} phone={booking.client_phone} />
      )}

      <Link
        href="/book"
        className="mt-6 block text-center text-sm text-neutral-600 hover:text-neutral-900 underline"
      >
        Pesan slot lain
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_payment: "bg-amber-100 text-amber-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    completed: "bg-neutral-200 text-neutral-700",
    cancelled: "bg-red-100 text-red-700",
  };
  const label: Record<string, string> = {
    pending_payment: "Menunggu Pembayaran",
    confirmed: "Terkonfirmasi",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-neutral-100 text-neutral-700"}`}>
      {label[status] ?? status}
    </span>
  );
}
