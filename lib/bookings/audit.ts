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
  "booking.created": "Booking created",
  "booking.confirmed": "Payment confirmed",
  "booking.completed": "Booking marked completed",
  "whatsapp.drafted": "WhatsApp draft generated",
  "whatsapp.sent": "WhatsApp message sent",
  "whatsapp.failed": "WhatsApp send failed",
};

export function labelForAction(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}
