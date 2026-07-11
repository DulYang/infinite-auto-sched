import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";
import type { Booking } from "@/lib/types";

// Daily summary for the admin: bookings + revenue for a given day.
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Tidak diotorisasi" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "Parameter 'date' wajib diisi." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("status, amount_due")
    .eq("booking_date", date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Pick<Booking, "status" | "amount_due">[];

  const summary = {
    date,
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending_payment").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    completed: rows.filter((r) => r.status === "completed").length,
    // Revenue = amount from bookings whose payment is settled (confirmed or completed).
    revenue: rows
      .filter((r) => r.status === "confirmed" || r.status === "completed")
      .reduce((sum, r) => sum + Number(r.amount_due), 0),
    // Money still owed on unpaid bookings for the day.
    outstanding: rows
      .filter((r) => r.status === "pending_payment")
      .reduce((sum, r) => sum + Number(r.amount_due), 0),
  };

  return NextResponse.json({ summary });
}
