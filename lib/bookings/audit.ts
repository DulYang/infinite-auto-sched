import type { SupabaseClient } from "@supabase/supabase-js";

export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: {
    action: string;
    entityType: string;
    entityId: string | null;
    details?: Record<string, unknown>;
    performedBy?: string;
  },
) {
  await supabase.from("audit_logs").insert({
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    details: entry.details ?? null,
    performed_by: entry.performedBy ?? "admin",
  });
}

export const AUDIT_LABELS: Record<string, string> = {
  "booking.created": "Pemesanan dibuat",
  "booking.confirmed": "Pembayaran dikonfirmasi",
  "booking.completed": "Pemesanan ditandai selesai",
  "booking.cancelled": "Pemesanan dibatalkan",
  "booking.rescheduled": "Pemesanan dijadwalkan ulang",
  "whatsapp.drafted": "Draf WhatsApp dibuat",
  "whatsapp.sent": "Pesan WhatsApp terkirim",
  "whatsapp.failed": "Pengiriman WhatsApp gagal",
  "payment.received": "Pembayaran diterima",
};

export function labelForAction(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}
