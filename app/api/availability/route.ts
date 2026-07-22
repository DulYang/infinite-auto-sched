import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const courtId = searchParams.get("courtId");
  // Optional: ignore one booking's own range (used by the reschedule picker
  // so a booking doesn't block itself from shifting to an overlapping time).
  const excludeBooking = searchParams.get("excludeBooking");

  if (!date || !courtId) {
    return NextResponse.json({ error: "date dan courtId wajib diisi." }, { status: 400 });
  }

  // taken = overlaps a CONFIRMED/COMPLETED booking (truly unavailable).
  // pending = overlaps only a PENDING booking ("Belum Konfirmasi", still
  // pickable — a soft hold the admin can override).
  const [takenRes, pendingRes] = await Promise.all([
    supabase.rpc("taken_slot_ids", {
      p_court_id: courtId,
      p_date: date,
      p_exclude_booking: excludeBooking || null,
    }),
    supabase.rpc("pending_slot_ids", {
      p_court_id: courtId,
      p_date: date,
      p_exclude_booking: excludeBooking || null,
    }),
  ]);

  if (takenRes.error || pendingRes.error) {
    return NextResponse.json(
      { error: (takenRes.error ?? pendingRes.error)?.message },
      { status: 500 },
    );
  }

  const takenSlotIds = (takenRes.data ?? []).map((row: { slot_id: string }) => row.slot_id);
  const pendingSlotIds = (pendingRes.data ?? []).map((row: { slot_id: string }) => row.slot_id);
  return NextResponse.json({ takenSlotIds, pendingSlotIds });
}
