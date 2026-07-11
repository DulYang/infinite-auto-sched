"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookingWithRelations } from "@/lib/types";
import { formatDisplayDate, formatTime } from "@/lib/bookings/date";
import { formatCurrency } from "@/lib/bookings/currency";
import BookingDetailPanel from "./BookingDetailPanel";
import RecurringBookingForm from "./RecurringBookingForm";

type LoadState = "loading" | "ready" | "error";

export default function AdminDashboard() {
  const [bookings, setBookings] = useState<BookingWithRelations[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/bookings?${params.toString()}`);
      if (!res.ok) throw new Error("Gagal memuat pemesanan.");
      const data = await res.json();
      setBookings(data.bookings ?? []);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setState("error");
    }
  }, [statusFilter, fromDate, toDate]);

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
      if (!res.ok) throw new Error(data.error ?? "Gagal mengonfirmasi pembayaran.");
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? data.booking : b)));
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [bookingId]: err instanceof Error ? err.message : "Terjadi kesalahan.",
      }));
    } finally {
      setConfirmingId(null);
    }
  }

  const hasActiveFilters = statusFilter !== "all" || fromDate || toDate;
  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? null;

  return (
    <div className="space-y-4">
      <RecurringBookingForm onCreated={load} />

      <div className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 bg-white px-4 py-3">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="statusFilter">
            Status
          </label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
          >
            <option value="all">Semua</option>
            <option value="pending_payment">Menunggu Pembayaran</option>
            <option value="confirmed">Terkonfirmasi</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="fromDate">
            Dari
          </label>
          <input
            id="fromDate"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="toDate">
            Sampai
          </label>
          <input
            id="toDate"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setFromDate("");
              setToDate("");
            }}
            className="text-sm text-neutral-500 hover:text-neutral-800 underline pb-1.5"
          >
            Hapus filter
          </button>
        )}
      </div>

      {state === "loading" && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-neutral-200 rounded animate-pulse" />
          ))}
        </div>
      )}

      {state === "error" && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline font-medium">
            Coba lagi
          </button>
        </div>
      )}

      {state === "ready" && bookings.length === 0 && (
        <div className="rounded border border-neutral-200 bg-white px-4 py-10 text-center text-neutral-500 text-sm">
          {hasActiveFilters
            ? "Tidak ada pemesanan yang cocok dengan filter ini."
            : "Belum ada pemesanan. Bagikan tautan pemesanan kepada klien Anda."}
        </div>
      )}

      {state === "ready" && bookings.length > 0 && (
        <>
          {/* Mobile: stacked cards */}
          <div className="md:hidden space-y-3">
            {bookings.map((booking) => (
              <div key={booking.id} className="rounded border border-neutral-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedBookingId(booking.id)}
                        className="font-medium text-neutral-900 hover:underline text-left"
                      >
                        {booking.client_name}
                      </button>
                      {booking.recurrence_group_id && <RecurringBadge />}
                    </div>
                    <div className="text-xs text-neutral-400">{booking.client_phone}</div>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <StatusBadge status={booking.status} />
                    <WhatsAppBadge booking={booking} />
                    {booking.receipt_path && <ReceiptBadge />}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
                  <dt className="text-neutral-400">Lapangan</dt>
                  <dd className="text-right">{booking.court?.name ?? "—"}</dd>
                  <dt className="text-neutral-400">Tanggal</dt>
                  <dd className="text-right">{formatDisplayDate(booking.booking_date)}</dd>
                  <dt className="text-neutral-400">Slot</dt>
                  <dd className="text-right">
                    {booking.slot
                      ? `${booking.slot.label} (${formatTime(booking.slot.start_time)}–${formatTime(booking.slot.end_time)})`
                      : "—"}
                  </dd>
                  <dt className="text-neutral-400">Jumlah</dt>
                  <dd className="text-right">{formatCurrency(booking.amount_due)}</dd>
                </dl>

                <div className="mt-3">
                  {booking.status === "pending_payment" ? (
                    <button
                      onClick={() => markPaymentReceived(booking.id)}
                      disabled={confirmingId === booking.id}
                      className="w-full rounded bg-neutral-900 text-white text-sm font-medium py-2 hover:bg-neutral-800 disabled:opacity-40"
                    >
                      {confirmingId === booking.id ? "Mengonfirmasi…" : "Tandai Pembayaran Diterima"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedBookingId(booking.id)}
                      className="w-full rounded border border-neutral-300 text-sm font-medium py-2 hover:bg-neutral-100"
                    >
                      Lihat Detail
                    </button>
                  )}
                  {rowError[booking.id] && (
                    <div className="text-xs text-red-600 mt-1.5">{rowError[booking.id]}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto rounded border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Klien</th>
                  <th className="px-4 py-2.5 font-medium">Lapangan</th>
                  <th className="px-4 py-2.5 font-medium">Tanggal</th>
                  <th className="px-4 py-2.5 font-medium">Slot</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Jumlah</th>
                  <th className="px-4 py-2.5 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedBookingId(booking.id)}
                          className="font-medium text-neutral-900 hover:underline text-left"
                        >
                          {booking.client_name}
                        </button>
                        {booking.recurrence_group_id && <RecurringBadge />}
                      </div>
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
                        {booking.receipt_path && <ReceiptBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatCurrency(booking.amount_due)}</td>
                    <td className="px-4 py-3 text-right">
                      {booking.status === "pending_payment" ? (
                        <button
                          onClick={() => markPaymentReceived(booking.id)}
                          disabled={confirmingId === booking.id}
                          className="rounded bg-neutral-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-neutral-800 disabled:opacity-40"
                        >
                          {confirmingId === booking.id ? "Mengonfirmasi…" : "Tandai Pembayaran Diterima"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setSelectedBookingId(booking.id)}
                          className="rounded border border-neutral-300 text-xs font-medium px-3 py-1.5 hover:bg-neutral-100"
                        >
                          Lihat
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
        </>
      )}

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

function RecurringBadge() {
  return (
    <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] font-medium">
      Rutin
    </span>
  );
}

function ReceiptBadge() {
  return (
    <span className="rounded-full bg-sky-100 text-sky-700 px-2.5 py-0.5 text-xs font-medium">
      Bukti ✓
    </span>
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
    sent: "WhatsApp Terkirim",
    failed: "WhatsApp Gagal",
    pending: "Draf WhatsApp Siap",
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
