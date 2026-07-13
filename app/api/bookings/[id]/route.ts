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
    .select("*, court:courts(*), slot:time_slots(*), whatsapp_logs(*), payments(*)")
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

  if (!action || !["confirm", "complete", "cancel", "reschedule"].includes(action)) {
    return NextResponse.json(
      { error: "aksi harus 'confirm', 'complete', 'cancel', atau 'reschedule'" },
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

  // ── Cancel ────────────────────────────────────────────────────────────────
  if (action === "cancel") {
    if (existing.status === "completed") {
      return NextResponse.json(
        { error: "Tidak dapat membatalkan pemesanan yang sudah selesai." },
        { status: 409 },
      );
    }
    const { data: booking, error } = await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, court:courts(*), slot:time_slots(*), whatsapp_logs(*), payments(*)")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await writeAuditLog(supabase, {
      action: "booking.cancelled",
      entityType: "booking",
      entityId: booking.id,
      details: { before: existing.status, via: "admin" },
      performedBy: "admin",
    });
    return NextResponse.json({ booking });
  }

  // ── Reschedule ──────────────────────────────────────────────────────────────
  if (action === "reschedule") {
    if (existing.status === "completed" || existing.status === "cancelled") {
      return NextResponse.json(
        { error: `Tidak dapat menjadwalkan ulang pemesanan dengan status '${existing.status}'.` },
        { status: 409 },
      );
    }
    const newSlotId = (body?.slotId as string | undefined) ?? existing.slot_id;
    const newDate = (body?.bookingDate as string | undefined) ?? existing.booking_date;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(`${newDate}T00:00:00`) < today) {
      return NextResponse.json(
        { error: "Tidak dapat menjadwalkan ke tanggal yang sudah lewat." },
        { status: 400 },
      );
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .update({ slot_id: newSlotId, booking_date: newDate })
      .eq("id", id)
      .select("*, court:courts(*), slot:time_slots(*), whatsapp_logs(*), payments(*)")
      .single();

    if (error) {
      if (error.code === "23505" || error.code === "23P01") {
        return NextResponse.json(
          { error: "Slot tujuan sudah terisi. Silakan pilih slot lain." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await writeAuditLog(supabase, {
      action: "booking.rescheduled",
      entityType: "booking",
      entityId: booking.id,
      details: {
        from: { slot_id: existing.slot_id, booking_date: existing.booking_date },
        to: { slot_id: newSlotId, booking_date: newDate },
      },
      performedBy: "admin",
    });

    // If already confirmed, draft a fresh WhatsApp message with the new details.
    if (booking.status === "confirmed" && booking.court && booking.slot) {
      const draft = draftWhatsAppMessage({
        clientName: booking.client_name,
        courtName: booking.court.name,
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
          details: { booking_id: booking.id, reason: "reschedule" },
          performedBy: "system",
        });
        booking.whatsapp_logs = [...(booking.whatsapp_logs ?? []), log];
      }
    }

    return NextResponse.json({ booking });
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
    .select("*, court:courts(*), slot:time_slots(*), whatsapp_logs(*), payments(*)")
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

  if (action === "confirm") {
    // Record the manually-verified payment. Optional reference from the admin.
    const reference =
      typeof body?.reference === "string" && body.reference.trim()
        ? body.reference.trim()
        : null;
    const { data: payment } = await supabase
      .from("payments")
      .insert({
        booking_id: booking.id,
        provider: "manual",
        provider_ref: reference,
        amount: booking.amount_due,
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (payment) {
      await writeAuditLog(supabase, {
        action: "payment.received",
        entityType: "payment",
        entityId: payment.id,
        details: { provider: "manual", amount: booking.amount_due, ref: reference },
        performedBy: "admin",
      });
      booking.payments = [payment];
    }
  }

  if (action === "confirm" && booking.court && booking.slot) {
    const draft = draftWhatsAppMessage({
      clientName: booking.client_name,
      courtName: booking.court.name,
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
