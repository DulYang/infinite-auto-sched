import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const bookingId = searchParams.get("bookingId");

  let query = supabase
    .from("whatsapp_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (bookingId) query = query.eq("booking_id", bookingId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data });
}
