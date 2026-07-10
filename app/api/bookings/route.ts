import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { isValidE164, PHONE_FORMAT_ERROR } from "@/lib/bookings/phone";
import { writeAuditLog } from "@/lib/bookings/audit";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const date = searchParams.get("date");
  const courtId = searchParams.get("courtId");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("bookings")
    .select("*, court:courts(*), slot:time_slots(*), whatsapp_logs(*)")
    .order("created_at", { ascending: false });

  if (date) query = query.eq("booking_date", date);
  if (courtId) query = query.eq("court_id", courtId);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("booking_date", from);
  if (to) query = query.lte("booking_date", to);

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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
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
      { error: "Missing required fields: courtId, slotId, bookingDate, clientName, clientPhone" },
      { status: 400 },
    );
  }

  if (!isValidE164(clientPhone)) {
    return NextResponse.json({ error: PHONE_FORMAT_ERROR }, { status: 400 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestedDate = new Date(`${bookingDate}T00:00:00`);
  if (requestedDate < today) {
    return NextResponse.json(
      { error: "Cannot book a date in the past." },
      { status: 400 },
    );
  }

  const { data: court } = await supabase
    .from("courts")
    .select("*")
    .eq("id", courtId)
    .maybeSingle();

  if (!court) {
    return NextResponse.json({ error: "Court not found." }, { status: 400 });
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
      amount_due: 500,
      notes: notes?.trim() || null,
    })
    .select("*, court:courts(*), slot:time_slots(*)")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This slot is already taken. Please choose another." },
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

  return NextResponse.json({ booking }, { status: 201 });
}
