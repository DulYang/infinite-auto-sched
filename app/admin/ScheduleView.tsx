"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookingWithRelations } from "@/lib/types";
import { formatDisplayDate, formatTime, todayInputValue, toDateInputValue } from "@/lib/bookings/date";
import { formatCurrency } from "@/lib/bookings/currency";
import BookingDetailPanel from "./BookingDetailPanel";
import { StatusBadge } from "./AdminDashboard";

type LoadState = "loading" | "ready" | "error";

function defaultToDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 13);
  return toDateInputValue(d);
}

export default function ScheduleView() {
  const [bookings, setBookings] = useState<BookingWithRelations[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState(todayInputValue());
  const [toDate, setToDate] = useState(defaultToDate());
  const [showCancelled, setShowCancelled] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/bookings?${params.toString()}`);
      if (!res.ok) throw new Error("Gagal memuat jadwal.");
      const data = await res.json();
      setBookings(data.bookings ?? []);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setState("error");
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? null;

  const visibleBookings = showCancelled
    ? bookings
    : bookings.filter((b) => b.status !== "cancelled");

  // Group by date, then sort each day's bookings by slot start time so the
  // whole day reads top-to-bottom exactly like the real schedule.
  const groups = new Map<string, BookingWithRelations[]>();
  for (const booking of visibleBookings) {
    const list = groups.get(booking.booking_date) ?? [];
    list.push(booking);
    groups.set(booking.booking_date, list);
  }
  const sortedDates = [...groups.keys()].sort();
  for (const date of sortedDates) {
    groups.get(date)!.sort((a, b) => {
      const aTime = a.slot?.start_time ?? "";
      const bTime = b.slot?.start_time ?? "";
      return aTime.localeCompare(bTime);
    });
  }

  return (
    <div className="rounded border border-neutral-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">Jadwal Pemesanan</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Semua slot yang sudah terisi, diurutkan per tanggal — sekali lihat, tanpa buka satu-satu.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="scheduleFrom">
              Dari
            </label>
            <input
              id="scheduleFrom"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="scheduleTo">
              Sampai
            </label>
            <input
              id="scheduleTo"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="rounded border-neutral-300"
            />
            Tampilkan yang dibatalkan
          </label>
        </div>
      </div>

      {state === "loading" && (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-neutral-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {state === "error" && (
        <div className="flex items-center justify-between px-4 py-4 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={load} className="underline font-medium">
            Coba lagi
          </button>
        </div>
      )}

      {state === "ready" && sortedDates.length === 0 && (
        <div className="px-4 py-10 text-center text-neutral-500 text-sm">
          Tidak ada pemesanan pada rentang tanggal ini.
        </div>
      )}

      {state === "ready" && sortedDates.length > 0 && (
        <div className="divide-y divide-neutral-100">
          {sortedDates.map((date) => {
            const dayBookings = groups.get(date)!;
            return (
              <div key={date} className="px-4 py-3">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-sm font-semibold text-neutral-800">
                    {formatDisplayDate(date)}
                  </h3>
                  <span className="text-xs text-neutral-400">
                    {dayBookings.length} pemesanan
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {dayBookings.map((booking) => (
                    <li key={booking.id}>
                      <button
                        onClick={() => setSelectedBookingId(booking.id)}
                        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm hover:border-neutral-300 hover:bg-white"
                      >
                        <span className="font-mono text-xs text-neutral-500 shrink-0 w-[92px]">
                          {booking.slot
                            ? `${formatTime(booking.slot.start_time)}–${formatTime(booking.slot.end_time)}`
                            : "—"}
                        </span>
                        <span className="font-medium text-neutral-900">{booking.client_name}</span>
                        <span className="text-xs text-neutral-400">{booking.client_phone}</span>
                        <span className="ml-auto flex items-center gap-2 shrink-0">
                          <span className="text-xs text-neutral-500">
                            {formatCurrency(booking.amount_due)}
                          </span>
                          <StatusBadge status={booking.status} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
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
