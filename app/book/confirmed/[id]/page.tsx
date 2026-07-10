import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDisplayDate, formatTime } from "@/lib/bookings/date";
import type { BookingWithRelations } from "@/lib/types";

export default async function BookingConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*, court:courts(*), slot:time_slots(*)")
    .eq("id", id)
    .maybeSingle<BookingWithRelations>();

  if (!booking) {
    notFound();
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
        <div className="text-4xl mb-2">✅</div>
        <h1 className="text-xl font-bold text-emerald-900">Booking Submitted</h1>
        <p className="text-emerald-800 text-sm mt-1">
          We&apos;ve received your request. An admin will confirm once payment is verified.
        </p>
      </div>

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white text-sm">
        <Row label="Court" value={booking.court?.name ?? "—"} />
        <Row label="Time Slot" value={booking.slot?.label ?? "—"} />
        <Row
          label="Time"
          value={
            booking.slot
              ? `${formatTime(booking.slot.start_time)} – ${formatTime(booking.slot.end_time)}`
              : "—"
          }
        />
        <Row label="Date" value={formatDisplayDate(booking.booking_date)} />
        <Row label="Name" value={booking.client_name} />
        <Row label="Phone" value={booking.client_phone} />
        <Row label="Amount Due" value={`₱${booking.amount_due}`} />
        <Row label="Status" value={<StatusBadge status={booking.status} />} />
      </dl>

      <Link
        href="/book"
        className="mt-6 block text-center text-sm text-neutral-600 hover:text-neutral-900 underline"
      >
        Book another slot
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
  };
  const label: Record<string, string> = {
    pending_payment: "Pending Payment",
    confirmed: "Confirmed",
    completed: "Completed",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-neutral-100 text-neutral-700"}`}>
      {label[status] ?? status}
    </span>
  );
}
