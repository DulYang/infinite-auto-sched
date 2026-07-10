"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Court, TimeSlot, BookingWithRelations } from "@/lib/types";
import { isValidE164, PHONE_FORMAT_ERROR } from "@/lib/bookings/phone";
import { todayInputValue, tomorrowInputValue, formatTime } from "@/lib/bookings/date";

type LoadState = "loading" | "ready" | "error";

export default function BookingForm() {
  const router = useRouter();
  const [courts, setCourts] = useState<Court[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [staticState, setStaticState] = useState<LoadState>("loading");
  const [staticError, setStaticError] = useState<string | null>(null);

  const [date, setDate] = useState(tomorrowInputValue());
  const [courtId, setCourtId] = useState<string>("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const [takenSlotIds, setTakenSlotIds] = useState<Set<string>>(new Set());
  const [gridState, setGridState] = useState<LoadState>("loading");
  const [gridError, setGridError] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStaticState("loading");
      try {
        const [courtsRes, slotsRes] = await Promise.all([
          fetch("/api/courts"),
          fetch("/api/time-slots"),
        ]);
        if (!courtsRes.ok || !slotsRes.ok) throw new Error("Failed to load courts and time slots.");
        const courtsData = await courtsRes.json();
        const slotsData = await slotsRes.json();
        if (cancelled) return;
        setCourts(courtsData.courts ?? []);
        setTimeSlots(slotsData.timeSlots ?? []);
        if (courtsData.courts?.length) setCourtId(courtsData.courts[0].id);
        setStaticState("ready");
      } catch (err) {
        if (cancelled) return;
        setStaticError(err instanceof Error ? err.message : "Something went wrong.");
        setStaticState("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadGrid = useCallback(async () => {
    if (!courtId || !date) return;
    setGridState("loading");
    setGridError(null);
    try {
      const res = await fetch(`/api/bookings?date=${date}&courtId=${courtId}`);
      if (!res.ok) throw new Error("Failed to load slot availability.");
      const data = await res.json();
      const taken = new Set<string>(
        (data.bookings ?? []).map((b: BookingWithRelations) => b.slot_id),
      );
      setTakenSlotIds(taken);
      setGridState("ready");
    } catch (err) {
      setGridError(err instanceof Error ? err.message : "Something went wrong.");
      setGridState("error");
    }
  }, [courtId, date]);

  useEffect(() => {
    setSelectedSlotId(null);
    loadGrid();
  }, [loadGrid]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setPhoneError(null);

    if (!selectedSlotId) {
      setSubmitError("Please select an available time slot.");
      return;
    }
    if (!clientName.trim()) {
      setSubmitError("Please enter your name.");
      return;
    }
    if (!isValidE164(clientPhone)) {
      setPhoneError(PHONE_FORMAT_ERROR);
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
        setSubmitError(data.error ?? "Something went wrong.");
        if (res.status === 409) {
          loadGrid();
        }
        return;
      }
      router.push(`/book/confirmed/${data.booking.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (staticState === "loading") {
    return <div className="animate-pulse space-y-3">
      <div className="h-10 bg-neutral-200 rounded" />
      <div className="h-32 bg-neutral-200 rounded" />
      <div className="h-40 bg-neutral-200 rounded" />
    </div>;
  }

  if (staticState === "error") {
    return (
      <div className="rounded border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
        {staticError ?? "Couldn't load the booking form."}
      </div>
    );
  }

  if (courts.length === 0) {
    return (
      <div className="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-neutral-500 text-sm">
        No courts are available for booking right now. Please check back later.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="date">
            Date
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
            Court
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

      <div>
        <p className="block text-sm font-medium mb-2">Time Slot</p>
        {gridState === "loading" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-neutral-200 rounded animate-pulse" />
            ))}
          </div>
        )}
        {gridState === "error" && (
          <div className="rounded border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {gridError ?? "Couldn't load slot availability."}
          </div>
        )}
        {gridState === "ready" && timeSlots.length === 0 && (
          <div className="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-neutral-500 text-sm">
            No time slots configured yet.
          </div>
        )}
        {gridState === "ready" && timeSlots.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {timeSlots.map((slot) => {
              const taken = takenSlotIds.has(slot.id);
              const selected = selectedSlotId === slot.id;
              return (
                <button
                  type="button"
                  key={slot.id}
                  disabled={taken}
                  onClick={() => setSelectedSlotId(slot.id)}
                  className={[
                    "rounded border px-3 py-3 text-left text-sm transition",
                    taken
                      ? "bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed"
                      : selected
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100",
                  ].join(" ")}
                >
                  <div className="font-medium">{slot.label}</div>
                  <div className="text-xs opacity-80">
                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                  </div>
                  <div className="text-xs mt-1 opacity-80">{taken ? "Taken" : "Available"}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="clientName">
            Your Name
          </label>
          <input
            id="clientName"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Juan dela Cruz"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="clientPhone">
            Phone Number
          </label>
          <input
            id="clientPhone"
            type="tel"
            value={clientPhone}
            onChange={(e) => {
              setClientPhone(e.target.value);
              setPhoneError(null);
            }}
            onBlur={() => {
              if (clientPhone && !isValidE164(clientPhone)) setPhoneError(PHONE_FORMAT_ERROR);
            }}
            placeholder="+639991234567"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="notes">
            Notes (optional)
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
        {submitting ? "Submitting…" : "Book This Slot"}
      </button>
    </form>
  );
}
