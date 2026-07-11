"use client";

import { useEffect, useState } from "react";
import type { BookingWithRelations, WhatsAppLog, TimeSlot } from "@/lib/types";
import { formatDisplayDate, formatTime, todayInputValue } from "@/lib/bookings/date";
import { formatCurrency } from "@/lib/bookings/currency";
import { StatusBadge, latestWhatsAppLog } from "./AdminDashboard";

type LogLoadState = "loading" | "ready" | "error";

export default function BookingDetailPanel({
  booking,
  onClose,
  onBookingUpdate,
}: {
  booking: BookingWithRelations;
  onClose: () => void;
  onBookingUpdate: (booking: BookingWithRelations) => void;
}) {
  const [logs, setLogs] = useState<WhatsAppLog[]>(booking.whatsapp_logs ?? []);
  const [logState, setLogState] = useState<LogLoadState>("ready");
  const [logError, setLogError] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [priorBookings, setPriorBookings] = useState<BookingWithRelations[]>([]);

  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(booking.booking_date);
  const [rescheduleSlotId, setRescheduleSlotId] = useState(booking.slot_id);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [takenSlotIds, setTakenSlotIds] = useState<Set<string>>(new Set());

  const canModify = booking.status === "pending_payment" || booking.status === "confirmed";

  async function patchBooking(payload: Record<string, unknown>, failMsg: string) {
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? failMsg);
        return false;
      }
      onBookingUpdate(data.booking);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : failMsg);
      return false;
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Batalkan pemesanan ini? Slot akan tersedia kembali.")) return;
    await patchBooking({ action: "cancel" }, "Gagal membatalkan pemesanan.");
  }

  async function openReschedule() {
    setShowReschedule(true);
    setActionError(null);
    setRescheduleDate(booking.booking_date);
    setRescheduleSlotId(booking.slot_id);
    try {
      const [slotsRes, availRes] = await Promise.all([
        fetch("/api/time-slots"),
        fetch(`/api/availability?date=${booking.booking_date}&courtId=${booking.court_id}`),
      ]);
      const slotsData = await slotsRes.json();
      const availData = await availRes.json();
      setSlots(slotsData.timeSlots ?? []);
      setTakenSlotIds(new Set<string>(availData.takenSlotIds ?? []));
    } catch {
      // Non-fatal; the reschedule submit still validates server-side.
    }
  }

  async function refreshAvailability(date: string) {
    try {
      const res = await fetch(`/api/availability?date=${date}&courtId=${booking.court_id}`);
      const data = await res.json();
      setTakenSlotIds(new Set<string>(data.takenSlotIds ?? []));
    } catch {
      // ignore
    }
  }

  async function handleReschedule() {
    const ok = await patchBooking(
      { action: "reschedule", slotId: rescheduleSlotId, bookingDate: rescheduleDate },
      "Gagal menjadwalkan ulang.",
    );
    if (ok) setShowReschedule(false);
  }

  const activeLog = [...logs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0] as WhatsAppLog | undefined;

  // Recognize returning clients: fetch other bookings under the same phone.
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/bookings?phone=${encodeURIComponent(booking.client_phone)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPriorBookings(
          (data.bookings ?? []).filter((b: BookingWithRelations) => b.id !== booking.id),
        );
      } catch {
        // History is informational only.
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [booking.id, booking.client_phone]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLogState("loading");
      setLogError(null);
      try {
        const res = await fetch(`/api/whatsapp-logs?bookingId=${booking.id}`);
        if (!res.ok) throw new Error("Gagal memuat log WhatsApp.");
        const data = await res.json();
        if (cancelled) return;
        setLogs(data.logs ?? []);
        setLogState("ready");
      } catch (err) {
        if (cancelled) return;
        setLogError(err instanceof Error ? err.message : "Terjadi kesalahan.");
        setLogState("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  useEffect(() => {
    if (activeLog) {
      setDraftText(activeLog.message_body || activeLog.message_draft || "");
    }
  }, [activeLog?.id]);

  async function handleSend() {
    if (!activeLog) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: activeLog.id, messageBody: draftText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error ?? "Gagal mengirim pesan WhatsApp.");
      }
      if (data.log) {
        setLogs((prev) => prev.map((l) => (l.id === data.log.id ? data.log : l)));
        onBookingUpdate({
          ...booking,
          whatsapp_logs: (booking.whatsapp_logs ?? []).map((l) =>
            l.id === data.log.id ? data.log : l,
          ),
        });
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-md bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="font-semibold">Detail Pemesanan</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Status</span>
            <StatusBadge status={booking.status} />
          </div>

          {priorBookings.length > 0 && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <p className="text-sm font-medium text-emerald-900">
                Klien berulang — {priorBookings.length} pemesanan sebelumnya
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-emerald-800">
                {priorBookings.slice(0, 5).map((b) => (
                  <li key={b.id} className="flex justify-between gap-3">
                    <span>
                      {formatDisplayDate(b.booking_date)}
                      {b.slot ? ` · ${b.slot.label}` : ""}
                    </span>
                    <span className="shrink-0">{statusLabel(b.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <dl className="divide-y divide-neutral-100 rounded border border-neutral-200">
            <Row label="Klien" value={booking.client_name} />
            <Row label="Telepon" value={booking.client_phone} />
            <Row label="Lapangan" value={booking.court?.name ?? "—"} />
            <Row label="Slot" value={booking.slot?.label ?? "—"} />
            <Row
              label="Waktu"
              value={
                booking.slot
                  ? `${formatTime(booking.slot.start_time)} – ${formatTime(booking.slot.end_time)}`
                  : "—"
              }
            />
            <Row label="Tanggal" value={formatDisplayDate(booking.booking_date)} />
            <Row label="Jumlah Tagihan" value={formatCurrency(booking.amount_due)} />
            {booking.payment_confirmed_at && (
              <Row
                label="Pembayaran Dikonfirmasi"
                value={new Date(booking.payment_confirmed_at).toLocaleString("id-ID")}
              />
            )}
            {booking.notes && <Row label="Catatan" value={booking.notes} />}
          </dl>

          {(booking.payments?.length ?? 0) > 0 && (
            <div className="pt-2">
              <h3 className="font-semibold mb-2">Pembayaran</h3>
              <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
                {booking.payments!.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div>
                      <div className="font-medium">{formatCurrency(p.amount)}</div>
                      <div className="text-xs text-neutral-400">
                        {paymentProviderLabel(p.provider)}
                        {p.provider_ref ? ` · Ref: ${p.provider_ref}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <PaymentStatusBadge status={p.status} />
                      {p.paid_at && (
                        <div className="text-xs text-neutral-400 mt-1">
                          {new Date(p.paid_at).toLocaleString("id-ID")}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {booking.status !== "pending_payment" && (
            <div className="pt-2">
              <h3 className="font-semibold mb-2">Konfirmasi WhatsApp</h3>

              {logState === "loading" && (
                <div className="h-24 bg-neutral-100 rounded animate-pulse" />
              )}

              {logState === "error" && (
                <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs">
                  {logError}
                </div>
              )}

              {logState === "ready" && !activeLog && (
                <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-4 text-center text-neutral-500 text-xs">
                  Belum ada draf.
                </div>
              )}

              {logState === "ready" && activeLog && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">
                      Sumber draf: {activeLog.message_draft_source ?? "template_engine"} ·
                      Tingkat keyakinan: {activeLog.message_draft_confidence ?? "—"}
                    </span>
                    <SendStatusBadge status={activeLog.send_status} />
                  </div>
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={4}
                    disabled={activeLog.send_status === "sent"}
                    className="w-full rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50 disabled:text-neutral-500"
                  />

                  {activeLog.send_status === "failed" && activeLog.error_message && (
                    <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs">
                      {activeLog.error_message}
                    </div>
                  )}
                  {sendError && (
                    <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs">
                      {sendError}
                    </div>
                  )}

                  {activeLog.send_status === "sent" ? (
                    <div className="text-xs text-emerald-700">
                      Terkirim{" "}
                      {activeLog.sent_at ? new Date(activeLog.sent_at).toLocaleString("id-ID") : ""}
                    </div>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={sending || !draftText.trim()}
                      className="w-full rounded bg-emerald-600 text-white text-sm font-medium py-2 hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {sending
                        ? "Mengirim…"
                        : activeLog.send_status === "failed"
                          ? "Kirim Ulang"
                          : "Kirim WhatsApp"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {canModify && (
            <div className="pt-2 border-t border-neutral-200">
              {actionError && (
                <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs mb-2">
                  {actionError}
                </div>
              )}

              {!showReschedule ? (
                <div className="flex gap-2">
                  <button
                    onClick={openReschedule}
                    disabled={actionBusy}
                    className="flex-1 rounded border border-neutral-300 text-sm font-medium py-2 hover:bg-neutral-100 disabled:opacity-40"
                  >
                    Jadwalkan Ulang
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={actionBusy}
                    className="flex-1 rounded border border-red-300 text-red-700 text-sm font-medium py-2 hover:bg-red-50 disabled:opacity-40"
                  >
                    {actionBusy ? "Memproses…" : "Batalkan"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="font-semibold">Jadwalkan Ulang</h3>
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="rescheduleDate">
                      Tanggal baru
                    </label>
                    <input
                      id="rescheduleDate"
                      type="date"
                      min={todayInputValue()}
                      value={rescheduleDate}
                      onChange={(e) => {
                        setRescheduleDate(e.target.value);
                        refreshAvailability(e.target.value);
                      }}
                      className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="rescheduleSlot">
                      Slot baru
                    </label>
                    <select
                      id="rescheduleSlot"
                      value={rescheduleSlotId}
                      onChange={(e) => setRescheduleSlotId(e.target.value)}
                      className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                    >
                      {slots.map((s) => {
                        // A slot is selectable if free, or if it's this booking's current slot on its current date.
                        const taken =
                          takenSlotIds.has(s.id) &&
                          !(s.id === booking.slot_id && rescheduleDate === booking.booking_date);
                        return (
                          <option key={s.id} value={s.id} disabled={taken}>
                            {s.label} ({formatTime(s.start_time)}–{formatTime(s.end_time)})
                            {taken ? " — terisi" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleReschedule}
                      disabled={actionBusy}
                      className="flex-1 rounded bg-neutral-900 text-white text-sm font-medium py-2 hover:bg-neutral-800 disabled:opacity-40"
                    >
                      {actionBusy ? "Menyimpan…" : "Simpan Jadwal Baru"}
                    </button>
                    <button
                      onClick={() => {
                        setShowReschedule(false);
                        setActionError(null);
                      }}
                      disabled={actionBusy}
                      className="rounded border border-neutral-300 text-sm font-medium px-4 py-2 hover:bg-neutral-100 disabled:opacity-40"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
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

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_payment: "Menunggu Pembayaran",
    confirmed: "Terkonfirmasi",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  };
  return labels[status] ?? status;
}

function paymentProviderLabel(provider: string): string {
  const labels: Record<string, string> = {
    manual: "Manual (admin)",
    gcash: "GCash",
    bank_transfer: "Transfer Bank",
    gateway: "Gateway Pembayaran",
  };
  return labels[provider] ?? provider;
}

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-700",
  };
  const label: Record<string, string> = {
    paid: "Lunas",
    pending: "Menunggu",
    failed: "Gagal",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-neutral-100 text-neutral-700"}`}>
      {label[status] ?? status}
    </span>
  );
}

function SendStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-800",
  };
  const label: Record<string, string> = {
    sent: "Terkirim",
    failed: "Gagal",
    pending: "Belum Ditinjau",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-neutral-100 text-neutral-700"}`}>
      {label[status] ?? status}
    </span>
  );
}
