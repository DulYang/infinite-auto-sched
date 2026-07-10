"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookingWithRelations } from "@/lib/types";
import { formatDisplayDate, formatTime } from "@/lib/bookings/date";
import BookingDetailPanel from "./BookingDetailPanel";

type LoadState = "loading" | "ready" | "error";

export default function AdminDashboard() {
  const [bookings, setBookings] = useState<BookingWithRelations[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      if (!res.ok) throw new Error("Failed to load bookings.");
      const data = await res.json();
      setBookings(data.bookings ?? []);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markPaymentReceived(bookingId: string) {
    setConfirmingId(bookingId);
    setRowError((prev) => ({ ...prev, [bookingId]: "" }));
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to confirm payment.");
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? data.booking : b)));
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [bookingId]: err instanceof Error ? err.message : "Something went wrong.",
      }));
    } finally {
      setConfirmingId(null);
    }
  }

  if (state === "loading") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 bg-neutral-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between">
        <span>{error}</span>
        <button onClick={load} className="underline font-medium">
          Retry
        </button>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded border border-neutral-200 bg-white px-4 py-10 text-center text-neutral-500 text-sm">
        No bookings yet. Share the booking link with your clients.
      </div>
    );
  }

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? null;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Court</th>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Slot</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {bookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelectedBookingId(booking.id)}
                    className="font-medium text-neutral-900 hover:underline text-left"
                  >
                    {booking.client_name}
                  </button>
                  <div className="text-xs text-neutral-400">{booking.client_phone}</div>
                </td>
                <td className="px-4 py-3">{booking.court?.name ?? "—"}</td>
                <td className="px-4 py-3">{formatDisplayDate(booking.booking_date)}</td>
                <td className="px-4 py-3">
                  {booking.slot ? (
                    <>
                      {booking.slot.label}
                      <div className="text-xs text-neutral-400">
                        {formatTime(booking.slot.start_time)} – {formatTime(booking.slot.end_time)}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 items-start">
                    <StatusBadge status={booking.status} />
                    <WhatsAppBadge booking={booking} />
                  </div>
                </td>
                <td className="px-4 py-3">₱{booking.amount_due}</td>
                <td className="px-4 py-3 text-right">
                  {booking.status === "pending_payment" ? (
                    <button
                      onClick={() => markPaymentReceived(booking.id)}
                      disabled={confirmingId === booking.id}
                      className="rounded bg-neutral-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-neutral-800 disabled:opacity-40"
                    >
                      {confirmingId === booking.id ? "Confirming…" : "Mark Payment Received"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedBookingId(booking.id)}
                      className="rounded border border-neutral-300 text-xs font-medium px-3 py-1.5 hover:bg-neutral-100"
                    >
                      View
                    </button>
                  )}
                  {rowError[booking.id] && (
                    <div className="text-xs text-red-600 mt-1 max-w-[180px] ml-auto">
                      {rowError[booking.id]}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedBooking && (
        <BookingDetailPanel
          booking={selectedBooking}
          onClose={() => setSelectedBookingId(null)}
          onBookingUpdate={(updated) =>
            setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
          }
        />
      )}
    </div>
  );
}

export function latestWhatsAppLog(booking: BookingWithRelations) {
  const logs = booking.whatsapp_logs ?? [];
  if (logs.length === 0) return null;
  return [...logs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

function WhatsAppBadge({ booking }: { booking: BookingWithRelations }) {
  const log = latestWhatsAppLog(booking);
  if (!log) return null;

  const styles: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-700",
    pending: "bg-neutral-100 text-neutral-600",
  };
  const label: Record<string, string> = {
    sent: "WhatsApp Sent",
    failed: "WhatsApp Failed",
    pending: "WhatsApp Draft Ready",
  };

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[log.send_status] ?? "bg-neutral-100 text-neutral-600"}`}>
      {label[log.send_status] ?? log.send_status}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
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
