"use client";

import { useEffect, useState } from "react";
import type { Court, TimeSlot } from "@/lib/types";
import { isValidE164, PHONE_FORMAT_ERROR } from "@/lib/bookings/phone";
import { tomorrowInputValue, todayInputValue, formatDisplayDate } from "@/lib/bookings/date";
import { slotMinutes } from "@/lib/bookings/pricing";

export default function RecurringBookingForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);

  const [courtId, setCourtId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [startDate, setStartDate] = useState(tomorrowInputValue());
  const [weeks, setWeeks] = useState(4);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ createdCount: number; skipped: string[] } | null>(null);

  useEffect(() => {
    if (!open || courts.length > 0) return;
    (async () => {
      try {
        const [c, s] = await Promise.all([fetch("/api/courts"), fetch("/api/time-slots")]);
        const cData = await c.json();
        const sData = await s.json();
        setCourts(cData.courts ?? []);
        setSlots(sData.timeSlots ?? []);
        if (cData.courts?.length) setCourtId(cData.courts[0].id);
        if (sData.timeSlots?.length) setSlotId(sData.timeSlots[0].id);
      } catch {
        setError("Gagal memuat data lapangan/slot.");
      }
    })();
  }, [open, courts.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!clientName.trim()) return setError("Nama klien wajib diisi.");
    if (!isValidE164(clientPhone)) return setError(PHONE_FORMAT_ERROR);

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courtId, slotId, startDate, weeks, clientName, clientPhone, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal membuat pemesanan rutin.");
        return;
      }
      setResult({ createdCount: data.createdCount, skipped: data.skipped ?? [] });
      setClientName("");
      setClientPhone("");
      setNotes("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded border border-neutral-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
      >
        <span>Buat Pemesanan Rutin (Mingguan)</span>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="border-t border-neutral-200 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="recCourt">
                Lapangan
              </label>
              <select
                id="recCourt"
                value={courtId}
                onChange={(e) => setCourtId(e.target.value)}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="recSlot">
                Slot
              </label>
              <select
                id="recSlot"
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                <optgroup label="Durasi 2 jam — Rp 350.000">
                  {slots
                    .filter((s) => slotMinutes(s.start_time, s.end_time) === 120)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Durasi 1 jam — Rp 250.000">
                  {slots
                    .filter((s) => slotMinutes(s.start_time, s.end_time) === 60)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="recStart">
                Tanggal mulai
              </label>
              <input
                id="recStart"
                type="date"
                min={todayInputValue()}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="recWeeks">
                Jumlah minggu
              </label>
              <input
                id="recWeeks"
                type="number"
                min={1}
                max={52}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="recName">
                Nama klien
              </label>
              <input
                id="recName"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Budi Santoso"
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="recPhone">
                Nomor telepon
              </label>
              <input
                id="recPhone"
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+6281234567890"
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="recNotes">
              Catatan (opsional)
            </label>
            <input
              id="recNotes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
              {result.createdCount} pemesanan dibuat.
              {result.skipped.length > 0 && (
                <>
                  {" "}
                  {result.skipped.length} dilewati karena slot sudah terisi:{" "}
                  {result.skipped.map((d) => formatDisplayDate(d)).join(", ")}.
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-neutral-900 text-white text-sm font-medium px-4 py-2 hover:bg-neutral-800 disabled:opacity-40"
          >
            {submitting ? "Membuat…" : "Buat Serial Mingguan"}
          </button>
        </form>
      )}
    </div>
  );
}
