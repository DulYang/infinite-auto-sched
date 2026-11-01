"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDisplayDate, tomorrowInputValue } from "@/lib/bookings/date";

type Exception = {
  id: string;
  exception_date: string;
  mode: "closed_day" | "closed_range" | "special_hours";
  start_min: number | null;
  end_min: number | null;
  reason: string | null;
};

type Conflict = {
  id: string;
  client_name: string;
  status: string;
  slot: { label: string } | { label: string }[] | null;
};

function fmt(min: number | null): string {
  if (min == null) return "";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function describe(e: Exception): string {
  if (e.mode === "closed_day") return "Tutup seharian";
  if (e.mode === "closed_range") return `Tutup ${fmt(e.start_min)}–${fmt(e.end_min)}`;
  return `Jam buka khusus ${fmt(e.start_min)}–${fmt(e.end_min)}`;
}

export default function ScheduleExceptions() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Exception[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [date, setDate] = useState(tomorrowInputValue());
  const [mode, setMode] = useState<Exception["mode"]>("closed_day");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/schedule-exceptions");
      if (!res.ok) throw new Error("Gagal memuat pengecualian jadwal.");
      setItems((await res.json()).exceptions ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setConflicts([]);
    try {
      const res = await fetch("/api/schedule-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mode, startTime, endTime, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan.");
        return;
      }
      setConflicts(data.conflicts ?? []);
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Hapus pengecualian ini? Slot akan dibuka kembali.")) return;
    const res = await fetch(`/api/schedule-exceptions/${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((x) => x.id !== id));
    else setError("Gagal menghapus.");
  }

  return (
    <div className="rounded border border-neutral-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
      >
        <span>Libur / Jam Buka Khusus (Sewa Tempat)</span>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-neutral-200 p-4 space-y-4">
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="exDate">
                Tanggal
              </label>
              <input
                id="exDate"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="exMode">
                Jenis
              </label>
              <select
                id="exMode"
                value={mode}
                onChange={(e) => setMode(e.target.value as Exception["mode"])}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="closed_day">Tutup seharian</option>
                <option value="closed_range">Tutup pada jam tertentu</option>
                <option value="special_hours">Jam buka khusus (di luar jam itu tutup)</option>
              </select>
            </div>
            {mode !== "closed_day" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="exStart">
                    {mode === "closed_range" ? "Tutup mulai" : "Buka mulai"}
                  </label>
                  <input
                    id="exStart"
                    type="time"
                    step={1800}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="exEnd">
                    {mode === "closed_range" ? "Tutup sampai" : "Buka sampai"}
                  </label>
                  <input
                    id="exEnd"
                    type="time"
                    step={1800}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="exReason">
                Alasan (opsional, terlihat oleh klien)
              </label>
              <input
                id="exReason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Disewa untuk acara"
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-neutral-900 text-white text-sm font-medium px-4 py-2 hover:bg-neutral-800 disabled:opacity-40"
              >
                {busy ? "Menyimpan…" : "Tambah Pengecualian"}
              </button>
            </div>
          </form>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm">
              <p className="font-medium">
                Tersimpan, tetapi {conflicts.length} pemesanan aktif sudah ada di jam tutup ini.
                Jadwalkan ulang atau batalkan secara manual:
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {conflicts.map((c) => {
                  const slot = Array.isArray(c.slot) ? c.slot[0] : c.slot;
                  return (
                    <li key={c.id}>
                      {c.client_name} — {slot?.label ?? "—"}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2">Pengecualian mendatang</h3>
            {loadError && <p className="text-xs text-red-600">{loadError}</p>}
            {!loadError && items.length === 0 && (
              <p className="text-sm text-neutral-500">Belum ada pengecualian.</p>
            )}
            <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
              {items.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div>
                    <div className="font-medium">{formatDisplayDate(x.exception_date)}</div>
                    <div className="text-xs text-neutral-500">
                      {describe(x)}
                      {x.reason ? ` · ${x.reason}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(x.id)}
                    className="text-xs text-red-700 underline shrink-0"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
