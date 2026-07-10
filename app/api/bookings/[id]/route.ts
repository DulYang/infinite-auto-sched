import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/bookings/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*, court:courts(*), slot:time_slots(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  return NextResponse.json({ booking });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await request.json().catch(() => null);
  const action = body?.action as string | undefined;

  if (!action || !["confirm", "complete"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'confirm' or 'complete'" },
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
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (action === "confirm" && existing.status !== "pending_payment") {
    return NextResponse.json(
      { error: `Cannot confirm a booking with status '${existing.status}'.` },
      { status: 409 },
    );
  }
  if (action === "complete" && existing.status !== "confirmed") {
    return NextResponse.json(
      { error: `Cannot complete a booking with status '${existing.status}'.` },
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
    .select("*, court:courts(*), slot:time_slots(*)")
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

  return NextResponse.json({ booking });
}
