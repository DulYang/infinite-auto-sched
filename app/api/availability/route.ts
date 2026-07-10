import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const courtId = searchParams.get("courtId");

  if (!date || !courtId) {
    return NextResponse.json({ error: "date and courtId are required." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("taken_slot_ids", {
    p_court_id: courtId,
    p_date: date,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const takenSlotIds = (data ?? []).map((row: { slot_id: string }) => row.slot_id);
  return NextResponse.json({ takenSlotIds });
}
