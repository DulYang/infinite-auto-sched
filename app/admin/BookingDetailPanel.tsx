"use client";

import type { BookingWithRelations } from "@/lib/types";
import { formatDisplayDate, formatTime } from "@/lib/bookings/date";
import { StatusBadge } from "./AdminDashboard";

export default function BookingDetailPanel({
  booking,
  onClose,
  onBookingUpdate,
}: {
  booking: BookingWithRelations;
  onClose: () => void;
  onBookingUpdate: (booking: BookingWithRelations) => void;
}) {
  void onBookingUpdate;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-md bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="font-semibold">Booking Detail</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Status</span>
            <StatusBadge status={booking.status} />
          </div>
          <dl className="divide-y divide-neutral-100 rounded border border-neutral-200">
            <Row label="Client" value={booking.client_name} />
            <Row label="Phone" value={booking.client_phone} />
            <Row label="Court" value={booking.court?.name ?? "—"} />
            <Row label="Slot" value={booking.slot?.label ?? "—"} />
            <Row
              label="Time"
              value={
                booking.slot
                  ? `${formatTime(booking.slot.start_time)} – ${formatTime(booking.slot.end_time)}`
                  : "—"
              }
            />
            <Row label="Date" value={formatDisplayDate(booking.booking_date)} />
            <Row label="Amount Due" value={`₱${booking.amount_due}`} />
            {booking.payment_confirmed_at && (
              <Row
                label="Payment Confirmed"
                value={new Date(booking.payment_confirmed_at).toLocaleString()}
              />
            )}
            {booking.notes && <Row label="Notes" value={booking.notes} />}
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <dt className="text-neutral-500 shrink-0">{label}</dt>
      <dd className="font-medium text-neutral-900 text-right">{value}</dd>
    </div>
  );
}
