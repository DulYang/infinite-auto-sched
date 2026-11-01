import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Public, PII-safe: the occupied minute ranges for a court + date, used by
// the booking page to paint the clock diagram and compute available starts.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const courtId = searchParams.get("courtId");

  if (!date || !courtId) {
    return NextResponse.json({ error: "date dan courtId wajib diisi." }, { status: 400 });
  }

  const supabase = await createClient();
  const [{ data, error }, blockedRes] = await Promise.all([
    supabase.rpc("booked_ranges", { p_court_id: courtId, p_date: date }),
    supabase.rpc("blocked_ranges", { p_date: date }),
  ]);

  if (error || blockedRes.error) {
    return NextResponse.json({ error: (error ?? blockedRes.error)?.message }, { status: 500 });
  }

  // Admin-set closures (rented out / time off) — shown as closed, not bookable.
  const closed = (
    (blockedRes.data ?? []) as { start_min: number; end_min: number; reason: string | null }[]
  ).map((r) => ({ start: r.start_min, end: r.end_min, state: "closed" as const }));
  const closureReasons = [
    ...new Set(
      ((blockedRes.data ?? []) as { reason: string | null }[])
        .map((r) => r.reason?.trim())
        .filter((r): r is string => !!r),
    ),
  ];

  const ranges = (
    (data ?? []) as { start_min: number; end_min: number; state: string }[]
  ).map((r) => ({
    start: r.start_min,
    end: r.end_min,
    // 'confirmed' -> taken (red); 'pending' -> soft hold (yellow).
    state: r.state === "confirmed" ? "confirmed" : "pending",
  }));

  return NextResponse.json({ ranges: [...ranges, ...closed], closureReasons });
}
