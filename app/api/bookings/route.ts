import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { isValidE164, PHONE_FORMAT_ERROR } from "@/lib/bookings/phone";
import { writeAuditLog } from "@/lib/bookings/audit";
import { notifyNewBooking } from "@/lib/whatsapp/notify";
import { checkPhoneOnWhatsApp } from "@/lib/whatsapp/send";

// The POST handler responds quickly, but notifyNewBooking schedules admin
// WhatsApp alerts via after() with long randomized anti-ban gaps (30-60s
// per admin, per WAHA's documented guidance) that run past the response —
// the function must stay alive for them. Sized with headroom for the worst
// case where every WAHA call times out on a degraded session: a single
// send can cost up to ~52s then (check-exists 8s + sendSeen 6s + typing
// up to 18s + sendText 20s). With 2 admin numbers configured, worst case
// is client(52s) + 2*(60s gap + 52s send) = ~276s — close enough to the
// old 180s cap that it needed real headroom, not just a bump. See
// lib/whatsapp/notify.ts and lib/whatsapp/send.ts for the per-call caps.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Tidak diotorisasi" }, { status: 401 });
  }

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const date = searchParams.get("date");
  const courtId = searchParams.get("courtId");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const phone = searchParams.get("phone");

  let query = supabase
    .from("bookings")
    .select("*, court:courts(*), slot:time_slots(*), whatsapp_logs(*), payments(*)")
    .order("created_at", { ascending: false });

  if (date) query = query.eq("booking_date", date);
  if (courtId) query = query.eq("court_id", courtId);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("booking_date", from);
  if (to) query = query.lte("booking_date", to);
  if (phone) query = query.eq("client_phone", phone);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Data permintaan tidak valid" }, { status: 400 });
  }

  const { courtId, slotId, bookingDate, clientName, clientPhone, notes } = body as {
    courtId?: string;
    slotId?: string;
    bookingDate?: string;
    clientName?: string;
    clientPhone?: string;
    notes?: string;
  };

  if (!courtId || !slotId || !bookingDate || !clientName || !clientPhone) {
    return NextResponse.json(
      { error: "Data wajib tidak lengkap: lapangan, slot, tanggal, nama, dan nomor telepon" },
      { status: 400 },
    );
  }

  if (!isValidE164(clientPhone)) {
    return NextResponse.json({ error: PHONE_FORMAT_ERROR }, { status: 400 });
  }

  // Defense in depth: the /book form already checks this before submitting,
  // but re-check server-side so a bypassed/stale client can't slip a
  // non-existent number into the system (it would eventually trigger a real
  // WAHA send attempt — a known anti-spam/ban trigger). Only a DEFINITIVE
  // "not on WhatsApp" blocks; null (WAHA unconfigured or check failed) is
  // fail-open so bookings never break because the number-check is down.
  const phoneExists = await checkPhoneOnWhatsApp(clientPhone);
  if (phoneExists === false) {
    return NextResponse.json(
      { error: "Nomor WhatsApp tidak ditemukan. Periksa kembali nomor Anda." },
      { status: 400 },
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestedDate = new Date(`${bookingDate}T00:00:00`);
  if (requestedDate < today) {
    return NextResponse.json(
      { error: "Tidak dapat memesan tanggal yang sudah lewat." },
      { status: 400 },
    );
  }

  const { data: court } = await supabase
    .from("courts")
    .select("*")
    .eq("id", courtId)
    .maybeSingle();

  if (!court) {
    return NextResponse.json({ error: "Lapangan tidak ditemukan." }, { status: 400 });
  }

  // Public clients have no SELECT access to bookings (locked down in
  // 0002/0004), so creation goes through a security-definer RPC that can
  // insert and return the new row without needing a table-level SELECT
  // policy for anon. The RPC derives the price from the slot duration
  // (2h = Rp 350.000, 1h = Rp 250.000) so it can't be tampered with.
  const { data: booking, error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_slot_id: slotId,
    p_booking_date: bookingDate,
    p_client_name: clientName.trim(),
    p_client_phone: clientPhone.trim(),
    p_notes: notes?.trim() || null,
  });

  if (error) {
    // 23505 = exact slot already booked; 23P01 = time-overlapping booking.
    if (error.code === "23505" || error.code === "23P01") {
      return NextResponse.json(
        { error: "Slot ini sudah terisi. Silakan pilih slot lain." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    action: "booking.created",
    entityType: "booking",
    entityId: booking.id,
    details: {
      client_name: booking.client_name,
      court_id: booking.court_id,
      slot_id: booking.slot_id,
      booking_date: booking.booking_date,
    },
    performedBy: "system",
  });

  // Notify the client (BCA payment instructions) and admin WhatsApp numbers.
  // Awaited so it reliably completes on serverless, but never throws — a
  // notification failure must not fail the booking itself.
  const { data: slot } = await supabase
    .from("time_slots")
    .select("start_time, end_time")
    .eq("id", slotId)
    .maybeSingle();
  if (slot) {
    await notifyNewBooking(supabase, booking, court, slot);
  }

  return NextResponse.json({ booking }, { status: 201 });
}
