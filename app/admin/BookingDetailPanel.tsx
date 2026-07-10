"use client";

import { useEffect, useState } from "react";
import type { BookingWithRelations, WhatsAppLog } from "@/lib/types";
import { formatDisplayDate, formatTime } from "@/lib/bookings/date";
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

  const activeLog = [...logs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0] as WhatsAppLog | undefined;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLogState("loading");
      setLogError(null);
      try {
        const res = await fetch(`/api/whatsapp-logs?bookingId=${booking.id}`);
        if (!res.ok) throw new Error("Failed to load WhatsApp log.");
        const data = await res.json();
        if (cancelled) return;
        setLogs(data.logs ?? []);
        setLogState("ready");
      } catch (err) {
        if (cancelled) return;
        setLogError(err instanceof Error ? err.message : "Something went wrong.");
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
        setSendError(data.error ?? "Failed to send WhatsApp message.");
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
      setSendError(err instanceof Error ? err.message : "Something went wrong.");
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
            <Row label="Amount Due" value={formatCurrency(booking.amount_due)} />
            {booking.payment_confirmed_at && (
              <Row
                label="Payment Confirmed"
                value={new Date(booking.payment_confirmed_at).toLocaleString()}
              />
            )}
            {booking.notes && <Row label="Notes" value={booking.notes} />}
          </dl>

          {booking.status !== "pending_payment" && (
            <div className="pt-2">
              <h3 className="font-semibold mb-2">WhatsApp Confirmation</h3>

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
                  No draft yet.
                </div>
              )}

              {logState === "ready" && activeLog && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">
                      Draft source: {activeLog.message_draft_source ?? "template_engine"} ·
                      Confidence: {activeLog.message_draft_confidence ?? "—"}
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
                      Sent {activeLog.sent_at ? new Date(activeLog.sent_at).toLocaleString() : ""}
                    </div>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={sending || !draftText.trim()}
                      className="w-full rounded bg-emerald-600 text-white text-sm font-medium py-2 hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {sending
                        ? "Sending…"
                        : activeLog.send_status === "failed"
                          ? "Retry Send"
                          : "Send WhatsApp"}
                    </button>
                  )}
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

function SendStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-800",
  };
  const label: Record<string, string> = {
    sent: "Sent",
    failed: "Failed",
    pending: "Unreviewed",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-neutral-100 text-neutral-700"}`}>
      {label[status] ?? status}
    </span>
  );
}
