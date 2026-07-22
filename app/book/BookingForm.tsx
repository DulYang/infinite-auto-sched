"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Court, TimeSlot } from "@/lib/types";
import { isValidE164, PHONE_FORMAT_ERROR } from "@/lib/bookings/phone";
import { todayInputValue, tomorrowInputValue } from "@/lib/bookings/date";
import { formatCurrency } from "@/lib/bookings/currency";
import { priceForMinutes, slotMinutes } from "@/lib/bookings/pricing";

type LoadState = "loading" | "ready" | "error";
// 'confirmed' -> taken (red, unavailable); 'pending' -> soft hold
// ("Belum Konfirmasi", yellow, still pickable).
type Range = { start: number; end: number; state: "confirmed" | "pending" };

const OPEN_MIN = 8 * 60; // 08:00
const CLOSE_MIN = 22 * 60; // 22:00

export default function BookingForm() {
  const router = useRouter();
  const [courts, setCourts] = useState<Court[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [staticState, setStaticState] = useState<LoadState>("loading");
  const [staticError, setStaticError] = useState<string | null>(null);

  const [date, setDate] = useState(tomorrowInputValue());
  const [courtId, setCourtId] = useState<string>("");
  const [durationMin, setDurationMin] = useState(120);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");

  const [bookedRanges, setBookedRanges] = useState<Range[]>([]);
  const [rangesState, setRangesState] = useState<LoadState>("loading");
  const [rangesError, setRangesError] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [returningClient, setReturningClient] = useState(false);
  // 'idle' before any check; 'checking' while in flight; 'exists' confirmed
  // on WhatsApp; 'not_found' confirmed NOT on WhatsApp (blocks submit);
  // 'unknown' = WAHA unconfigured or check failed — never blocks (fail open).
  const [waCheckStatus, setWaCheckStatus] = useState<
    "idle" | "checking" | "exists" | "not_found" | "unknown"
  >("idle");

  async function lookupReturningClient() {
    if (!isValidE164(clientPhone)) return;
    try {
      const res = await fetch(`/api/clients/lookup?phone=${encodeURIComponent(clientPhone)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.name) {
        setReturningClient(true);
        if (!clientName.trim()) setClientName(data.name);
      } else {
        setReturningClient(false);
      }
    } catch {
      // Lookup is a convenience only; ignore failures.
    }
  }

  // Verifies the number is actually registered on WhatsApp BEFORE the client
  // submits. Catches typos immediately instead of the client finding out
  // days later that they never got the admin's confirmation — and keeps
  // mistyped numbers from ever reaching WAHA as a real send (a known
  // anti-spam/ban trigger; see lib/whatsapp/send.ts).
  async function checkWhatsAppNumber() {
    if (!isValidE164(clientPhone)) return "unknown" as const;
    setWaCheckStatus("checking");
    let result: "exists" | "not_found" | "unknown" = "unknown";
    try {
      const res = await fetch(`/api/whatsapp/check-number?phone=${encodeURIComponent(clientPhone)}`);
      const data = await res.json();
      if (data?.status === "exists" || data?.status === "not_found") result = data.status;
    } catch {
      // fall through with "unknown"
    }
    setWaCheckStatus(result);
    return result;
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStaticState("loading");
      try {
        const [courtsRes, slotsRes] = await Promise.all([
          fetch("/api/courts"),
          fetch("/api/time-slots"),
        ]);
        if (!courtsRes.ok || !slotsRes.ok) throw new Error("Gagal memuat lapangan dan slot waktu.");
        const courtsData = await courtsRes.json();
        const slotsData = await slotsRes.json();
        if (cancelled) return;
        setCourts(courtsData.courts ?? []);
        setTimeSlots(slotsData.timeSlots ?? []);
        if (courtsData.courts?.length) setCourtId(courtsData.courts[0].id);
        setStaticState("ready");
      } catch (err) {
        if (cancelled) return;
        setStaticError(err instanceof Error ? err.message : "Terjadi kesalahan.");
        setStaticState("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRanges = useCallback(async () => {
    if (!courtId || !date) return;
    setRangesState("loading");
    setRangesError(null);
    try {
      const res = await fetch(`/api/booked-ranges?date=${date}&courtId=${courtId}`);
      if (!res.ok) throw new Error("Gagal memuat jadwal hari itu.");
      const data = await res.json();
      setBookedRanges(data.ranges ?? []);
      setRangesState("ready");
    } catch (err) {
      setRangesError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setRangesState("error");
    }
  }, [courtId, date]);

  useEffect(() => {
    setSelectedSlotId("");
    loadRanges();
  }, [loadRanges]);

  // Slots for the chosen duration. A slot is only truly TAKEN when it overlaps
  // a CONFIRMED booking; overlapping only a PENDING booking makes it a soft
  // hold ("Belum Konfirmasi") that's still pickable. The DB remains the hard
  // guard (create_booking rejects a slot already confirmed).
  const startOptions = useMemo(() => {
    return timeSlots
      .filter((s) => slotMinutes(s.start_time, s.end_time) === durationMin)
      .map((s) => {
        const start = toMin(s.start_time);
        const end = toMin(s.end_time);
        const overlaps = bookedRanges.filter((r) => start < r.end && end > r.start);
        const taken = overlaps.some((r) => r.state === "confirmed");
        const pending = !taken && overlaps.some((r) => r.state === "pending");
        return { slot: s, taken, pending };
      })
      .sort((a, b) => toMin(a.slot.start_time) - toMin(b.slot.start_time));
  }, [timeSlots, durationMin, bookedRanges]);

  // Confirmed slots are removed; pending (soft-hold) slots remain selectable.
  const availableOptions = startOptions.filter((o) => !o.taken);
  const selectedSlot = timeSlots.find((s) => s.id === selectedSlotId) ?? null;
  const selectedSlotIsPending = startOptions.some((o) => o.slot.id === selectedSlotId && o.pending);
  const price = priceForMinutes(durationMin) ?? 0;

  const selectedRange: { start: number; end: number } | null = selectedSlot
    ? { start: toMin(selectedSlot.start_time), end: toMin(selectedSlot.end_time) }
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setPhoneError(null);

    if (!selectedSlotId) {
      setSubmitError("Silakan pilih jam mulai.");
      return;
    }
    if (!clientName.trim()) {
      setSubmitError("Silakan masukkan nama Anda.");
      return;
    }
    if (!isValidE164(clientPhone)) {
      setPhoneError(PHONE_FORMAT_ERROR);
      return;
    }

    // The blur handler usually resolves this before the user reaches submit,
    // but re-check inline for autofill/no-blur paths so a bad number can't
    // slip through. Only a confirmed "not_found" blocks — "unknown"
    // (WAHA down/unconfigured) always proceeds (fail open; the server
    // re-checks with the same fail-open rule as a last resort anyway).
    let waStatus = waCheckStatus;
    if (waStatus === "idle" || waStatus === "checking") {
      waStatus = await checkWhatsAppNumber();
    }
    if (waStatus === "not_found") {
      setSubmitError("Nomor WhatsApp tidak ditemukan. Periksa kembali nomor Anda.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtId,
          slotId: selectedSlotId,
          bookingDate: date,
          clientName,
          clientPhone,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Terjadi kesalahan.");
        if (res.status === 409) {
          setSelectedSlotId("");
          loadRanges();
        }
        return;
      }
      router.push(`/book/confirmed/${data.booking.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (staticState === "loading") {
    return <div className="animate-pulse space-y-3">
      <div className="h-10 bg-neutral-200 rounded" />
      <div className="h-56 bg-neutral-200 rounded" />
      <div className="h-40 bg-neutral-200 rounded" />
    </div>;
  }

  if (staticState === "error") {
    return (
      <div className="rounded border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
        {staticError ?? "Formulir pemesanan gagal dimuat."}
      </div>
    );
  }

  if (courts.length === 0) {
    return (
      <div className="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-neutral-500 text-sm">
        Tidak ada lapangan yang tersedia untuk dipesan saat ini. Silakan coba lagi nanti.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="date">
            Tanggal
          </label>
          <input
            id="date"
            type="date"
            min={todayInputValue()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="court">
            Lapangan
          </label>
          <select
            id="court"
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {courts.map((court) => (
              <option key={court.id} value={court.id}>
                {court.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="duration">
                Durasi
              </label>
              <select
                id="duration"
                value={durationMin}
                onChange={(e) => {
                  setDurationMin(Number(e.target.value));
                  setSelectedSlotId("");
                }}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value={120}>2 jam — {formatCurrency(350000)} (Rekomendasi)</option>
                <option value={60}>1 jam — {formatCurrency(250000)}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="startTime">
                Jam Mulai
              </label>
              {rangesState === "error" ? (
                <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
                  {rangesError}
                </div>
              ) : (
                <select
                  id="startTime"
                  value={selectedSlotId}
                  onChange={(e) => setSelectedSlotId(e.target.value)}
                  disabled={rangesState === "loading"}
                  className="w-full rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50"
                >
                  <option value="">
                    {rangesState === "loading" ? "Memuat…" : "— Pilih jam mulai —"}
                  </option>
                  {availableOptions.map(({ slot, pending }) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label}
                      {pending ? " — belum konfirmasi (bisa dipesan)" : ""}
                    </option>
                  ))}
                </select>
              )}
              {rangesState === "ready" && availableOptions.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  Tidak ada waktu tersedia untuk durasi ini pada tanggal tersebut.
                </p>
              )}
            </div>

            {selectedSlot && (
              <div className="rounded bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900">
                <span className="font-medium">{selectedSlot.label}</span> · Total{" "}
                <span className="font-semibold">{formatCurrency(price)}</span>
              </div>
            )}

            {selectedSlotIsPending && (
              <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Slot ini masih menunggu pembayaran pemesan lain (belum dikonfirmasi). Anda tetap
                bisa memesannya, namun konfirmasi akan dilakukan oleh admin — bukan otomatis.
              </div>
            )}
          </div>

          <ClockDiagram booked={bookedRanges} selected={selectedRange} />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="clientPhone">
            Nomor Telepon
          </label>
          <input
            id="clientPhone"
            type="tel"
            value={clientPhone}
            onChange={(e) => {
              setClientPhone(e.target.value);
              setPhoneError(null);
              setReturningClient(false);
              setWaCheckStatus("idle");
            }}
            onBlur={() => {
              if (clientPhone && !isValidE164(clientPhone)) {
                setPhoneError(PHONE_FORMAT_ERROR);
                return;
              }
              lookupReturningClient();
              checkWhatsAppNumber();
            }}
            placeholder="+6281234567890"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
          {waCheckStatus === "checking" && (
            <p className="text-xs text-neutral-400 mt-1">Memeriksa nomor WhatsApp…</p>
          )}
          {waCheckStatus === "not_found" && (
            <p className="text-xs text-red-600 mt-1">
              Nomor ini tidak terdaftar di WhatsApp. Periksa kembali nomor Anda — admin akan
              mengirim konfirmasi lewat WhatsApp ke nomor ini.
            </p>
          )}
          {waCheckStatus === "exists" && (
            <p className="text-xs text-emerald-600 mt-1">Nomor WhatsApp terverifikasi ✓</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="clientName">
            Nama Anda
          </label>
          <input
            id="clientName"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Budi Santoso"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          {returningClient && (
            <p className="text-xs text-emerald-700 mt-1">
              Selamat datang kembali! Nama Anda telah diisi otomatis — silakan ubah bila perlu.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="notes">
            Catatan (opsional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {submitError && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !selectedSlotId}
        className="w-full rounded bg-neutral-900 text-white font-medium py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 transition"
      >
        {submitting ? "Mengirim…" : `Pesan Sekarang${selectedSlot ? ` — ${formatCurrency(price)}` : ""}`}
      </button>
    </form>
  );
}

function toMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// 24-hour clock diagram: green = available (within 08.00-22.00), red =
// booked, white = closed, blue = the user's current selection.
function ClockDiagram({
  booked,
  selected,
}: {
  booked: Range[];
  selected: { start: number; end: number } | null;
}) {
  const C = 110;
  const R = 82;
  const W = 24;

  function pt(min: number, r: number) {
    const a = (min / 1440) * 2 * Math.PI - Math.PI / 2;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  }

  function arc(startMin: number, endMin: number, r: number) {
    // Nudge full-circle-ish arcs; SVG arcs can't span exactly 360°.
    const span = Math.min(endMin - startMin, 1439.9);
    const p0 = pt(startMin, r);
    const p1 = pt(startMin + span, r);
    const large = span > 720 ? 1 : 0;
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }

  const clamp = (r: Range) => ({
    start: Math.max(r.start, OPEN_MIN),
    end: Math.min(r.end, CLOSE_MIN),
  });

  const ticks = Array.from({ length: 24 }, (_, h) => {
    const major = h % 6 === 0;
    const o = pt(h * 60, R + W / 2 + 2);
    const i = pt(h * 60, R + W / 2 + (major ? -4 : 0) - 4);
    return { o, i, major, h };
  });

  const labels = [
    { h: 24, min: 0 },
    { h: 6, min: 360 },
    { h: 12, min: 720 },
    { h: 18, min: 1080 },
  ].map(({ h, min }) => ({ h, p: pt(min, R - W / 2 - 14) }));

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 220" className="w-full max-w-[230px]" role="img" aria-label="Diagram ketersediaan 24 jam">
        {/* closed (out of hours): white ring with hairline edges */}
        <circle cx={C} cy={C} r={R + W / 2} fill="none" stroke="#d4d4d4" strokeWidth="1" />
        <circle cx={C} cy={C} r={R - W / 2} fill="none" stroke="#d4d4d4" strokeWidth="1" />
        <path d={arc(0, 1440, R)} fill="none" stroke="#ffffff" strokeWidth={W - 2} />
        {/* open window: green */}
        <path d={arc(OPEN_MIN, CLOSE_MIN, R)} fill="none" stroke="#4ade80" strokeWidth={W - 2} />
        {/* pending soft-hold: yellow (drawn first so a later confirmed booking
            on the same range paints over it in red) */}
        {booked.map((r, idx) => {
          if (r.state !== "pending") return null;
          const c = clamp(r);
          if (c.end <= c.start) return null;
          return (
            <path key={`p${idx}`} d={arc(c.start, c.end, R)} fill="none" stroke="#facc15" strokeWidth={W - 2} />
          );
        })}
        {/* booked (confirmed): red */}
        {booked.map((r, idx) => {
          if (r.state !== "confirmed") return null;
          const c = clamp(r);
          if (c.end <= c.start) return null;
          return (
            <path key={`c${idx}`} d={arc(c.start, c.end, R)} fill="none" stroke="#f87171" strokeWidth={W - 2} />
          );
        })}
        {/* selection: blue */}
        {selected && (
          <path
            d={arc(selected.start, selected.end, R)}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={W - 2}
          />
        )}
        {/* hour ticks + labels */}
        {ticks.map((t) => (
          <line
            key={t.h}
            x1={t.i.x}
            y1={t.i.y}
            x2={t.o.x}
            y2={t.o.y}
            stroke={t.major ? "#525252" : "#a3a3a3"}
            strokeWidth={t.major ? 1.6 : 0.8}
          />
        ))}
        {labels.map((l) => (
          <text
            key={l.h}
            x={l.p.x}
            y={l.p.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="11"
            fill="#525252"
          >
            {l.h}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#4ade80]" /> Tersedia
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f87171]" /> Terisi
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#facc15]" /> Belum Konfirmasi
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-neutral-300 bg-white" /> Tutup
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#3b82f6]" /> Pilihan Anda
        </span>
      </div>
    </div>
  );
}
