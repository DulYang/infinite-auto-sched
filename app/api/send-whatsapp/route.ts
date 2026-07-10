import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { writeAuditLog } from "@/lib/bookings/audit";
import { isValidE164, PHONE_FORMAT_ERROR } from "@/lib/bookings/phone";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const body = await request.json().catch(() => null);
  const logId = body?.logId as string | undefined;
  const messageBody = body?.messageBody as string | undefined;

  if (!logId || !messageBody?.trim()) {
    return NextResponse.json({ error: "logId and messageBody are required." }, { status: 400 });
  }

  const { data: log, error: fetchError } = await supabase
    .from("whatsapp_logs")
    .select("*")
    .eq("id", logId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!log) {
    return NextResponse.json({ error: "WhatsApp log not found." }, { status: 404 });
  }

  if (!isValidE164(log.recipient_phone)) {
    const { data: updated } = await supabase
      .from("whatsapp_logs")
      .update({
        message_body: messageBody.trim(),
        send_status: "failed",
        error_message: PHONE_FORMAT_ERROR,
      })
      .eq("id", logId)
      .select("*")
      .single();

    await writeAuditLog(supabase, {
      action: "whatsapp.failed",
      entityType: "whatsapp_log",
      entityId: logId,
      details: { reason: PHONE_FORMAT_ERROR },
      performedBy: "admin",
    });

    return NextResponse.json({ log: updated, error: PHONE_FORMAT_ERROR }, { status: 400 });
  }

  const result = await sendWhatsAppMessage(log.recipient_phone, messageBody.trim());

  const updates = result.ok
    ? {
        message_body: messageBody.trim(),
        send_status: "sent" as const,
        sent_at: new Date().toISOString(),
        error_message: null,
        message_draft_review_status: "approved" as const,
      }
    : {
        message_body: messageBody.trim(),
        send_status: "failed" as const,
        error_message: result.error ?? "WhatsApp send failed.",
      };

  const { data: updated, error: updateError } = await supabase
    .from("whatsapp_logs")
    .update(updates)
    .eq("id", logId)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    action: result.ok ? "whatsapp.sent" : "whatsapp.failed",
    entityType: "whatsapp_log",
    entityId: logId,
    details: { booking_id: log.booking_id, simulated: result.simulated ?? false },
    performedBy: "admin",
  });

  if (!result.ok) {
    return NextResponse.json({ log: updated, error: updates.error_message }, { status: 502 });
  }

  return NextResponse.json({ log: updated });
}
