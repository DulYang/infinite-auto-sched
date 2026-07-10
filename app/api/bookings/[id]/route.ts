import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { writeAuditLog } from "@/lib/bookings/audit";
import { draftWhatsAppMessage } from "@/lib/bookings/template";
import { isValidE164 } from "@/lib/bookings/phone";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Tidak diotorisasi" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*, court:courts(*), slot:time_slots(*), whatsapp_logs(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Pemesanan tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({ booking });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Tidak diotorisasi" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const body = await request.json().catch(() => null);
  const action = body?.action as string | undefined;

  if (!action || !["confirm", "complete"].includes(action)) {
    return NextResponse.json(
      { error: "aksi harus 'confirm' atau 'complete'" },
      { status: 400 },
    );
  }

  const { data: existing, error: fetchError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Pemesanan tidak ditemukan." }, { status: 404 });
  }

  if (action === "confirm" && existing.status !== "pending_payment") {
    return NextResponse.json(
      { error: `Tidak dapat mengonfirmasi pemesanan dengan status '${existing.status}'.` },
      { status: 409 },
    );
  }
  if (action === "complete" && existing.status !== "confirmed") {
    return NextResponse.json(
      { error: `Tidak dapat menyelesaikan pemesanan dengan status '${existing.status}'.` },
      { status: 409 },
    );
  }

  const updates =
    action === "confirm"
      ? { status: "confirmed", payment_confirmed_at: new Date().toISOString() }
      : { status: "completed" };

  const { data: booking, error } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", id)
    .select("*, court:courts(*), slot:time_slots(*), whatsapp_logs(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    action: action === "confirm" ? "booking.confirmed" : "booking.completed",
    entityType: "booking",
    entityId: booking.id,
    details: { before: existing.status, after: booking.status },
    performedBy: "admin",
  });

  if (action === "confirm" && booking.court && booking.slot) {
    const draft = draftWhatsAppMessage({
      clientName: booking.client_name,
      courtName: booking.court.name,
      slotLabel: booking.slot.label,
      startTime: booking.slot.start_time,
      endTime: booking.slot.end_time,
      bookingDate: booking.booking_date,
      amountDue: booking.amount_due,
    });

    const { data: log } = await supabase
      .from("whatsapp_logs")
      .insert({
        booking_id: booking.id,
        recipient_phone: booking.client_phone,
        message_body: draft,
        send_status: "pending",
        message_draft: draft,
        message_draft_source: "template_engine",
        message_draft_confidence: isValidE164(booking.client_phone) ? 0.99 : 0.5,
        message_draft_review_status: "unreviewed",
      })
      .select("*")
      .single();

    if (log) {
      await writeAuditLog(supabase, {
        action: "whatsapp.drafted",
        entityType: "whatsapp_log",
        entityId: log.id,
        details: { booking_id: booking.id },
        performedBy: "system",
      });
      booking.whatsapp_logs = [log];
    }
  }

  return NextResponse.json({ booking });
}
