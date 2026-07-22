import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { isValidE164, PHONE_FORMAT_ERROR } from "@/lib/bookings/phone";
import { writeAuditLog } from "@/lib/bookings/audit";
import { toDateInputValue } from "@/lib/bookings/date";
import { priceForMinutes, slotMinutes } from "@/lib/bookings/pricing";

const MAX_WEEKS = 52;

// Admin: create a weekly recurring series. One booking per week; weeks whose
// slot is already taken are skipped and reported.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Tidak diotorisasi" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { courtId, slotId, startDate, clientName, clientPhone, notes, weeks } = (body ??
    {}) as {
    courtId?: string;
    slotId?: string;
    startDate?: string;
    clientName?: string;
    clientPhone?: string;
    notes?: string;
    weeks?: number;
  };

  if (!courtId || !slotId || !startDate || !clientName || !clientPhone) {
    return NextResponse.json(
      { error: "Data wajib tidak lengkap: lapangan, slot, tanggal mulai, nama, dan nomor telepon" },
      { status: 400 },
    );
  }
  if (!isValidE164(clientPhone)) {
    return NextResponse.json({ error: PHONE_FORMAT_ERROR }, { status: 400 });
  }
  const count = Math.floor(Number(weeks));
  if (!Number.isFinite(count) || count < 1 || count > MAX_WEEKS) {
    return NextResponse.json(
      { error: `Jumlah minggu harus antara 1 dan ${MAX_WEEKS}.` },
      { status: 400 },
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || start < today) {
    return NextResponse.json(
      { error: "Tanggal mulai tidak valid atau sudah lewat." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // Price follows the selected slot's duration (2h Rp 350.000 / 1h Rp 250.000).
  const { data: slot } = await supabase
    .from("time_slots")
    .select("start_time, end_time")
    .eq("id", slotId)
    .maybeSingle();
  if (!slot) {
    return NextResponse.json({ error: "Slot tidak ditemukan." }, { status: 400 });
  }
  const amountDue = priceForMinutes(slotMinutes(slot.start_time, slot.end_time));
  if (amountDue === null) {
    return NextResponse.json({ error: "Durasi slot tidak didukung." }, { status: 400 });
  }

  const groupId = crypto.randomUUID();
  const created: { id: string; booking_date: string }[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    const bookingDate = toDateInputValue(d);

    // Pending bookings are soft holds and no longer trip the overlap
    // constraint, so skip weeks that are already CONFIRMED for this slot
    // (truly taken) explicitly rather than relying on an insert error.
    const { data: takenRows } = await supabase.rpc("taken_slot_ids", {
      p_court_id: courtId,
      p_date: bookingDate,
    });
    if ((takenRows ?? []).some((r: { slot_id: string }) => r.slot_id === slotId)) {
      skipped.push(bookingDate);
      continue;
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        court_id: courtId,
        slot_id: slotId,
        booking_date: bookingDate,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        status: "pending_payment",
        amount_due: amountDue,
        notes: notes?.trim() || null,
        recurrence_group_id: groupId,
      })
      .select("id, booking_date")
      .single();

    if (error) {
      // Slot already taken that week — skip it.
      if (error.code === "23505" || error.code === "23P01") {
        skipped.push(bookingDate);
        continue;
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    created.push({ id: booking.id, booking_date: booking.booking_date });
    await writeAuditLog(supabase, {
      action: "booking.created",
      entityType: "booking",
      entityId: booking.id,
      details: { recurrence_group_id: groupId, booking_date: bookingDate, via: "recurring" },
      performedBy: "admin",
    });
  }

  return NextResponse.json({
    groupId,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
  });
}
