import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { writeAuditLog } from "@/lib/bookings/audit";

const MODES = ["closed_day", "closed_range", "special_hours"] as const;

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Admin: list upcoming exceptions (today onwards).
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Tidak diotorisasi" }, { status: 401 });

  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const { data, error } = await supabase
    .from("schedule_exceptions")
    .select("*")
    .gte("exception_date", today)
    .order("exception_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exceptions: data });
}

// Admin: create an exception. Existing active bookings that fall inside the
// closed window are NOT touched — they're returned as `conflicts` so the admin
// can reschedule/cancel them.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Tidak diotorisasi" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { date, mode, startTime, endTime, reason } = (body ?? {}) as {
    date?: string;
    mode?: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
  };

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  }
  if (!mode || !(MODES as readonly string[]).includes(mode)) {
    return NextResponse.json({ error: "Jenis pengecualian tidak valid." }, { status: 400 });
  }

  let startMin: number | null = null;
  let endMin: number | null = null;
  if (mode !== "closed_day") {
    if (!startTime || !endTime) {
      return NextResponse.json({ error: "Jam mulai dan selesai wajib diisi." }, { status: 400 });
    }
    startMin = toMin(startTime);
    endMin = toMin(endTime);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin) {
      return NextResponse.json({ error: "Jam selesai harus setelah jam mulai." }, { status: 400 });
    }
  }

  const supabase = await createClient();
  const { data: exception, error } = await supabase
    .from("schedule_exceptions")
    .insert({
      exception_date: date,
      mode,
      start_min: startMin,
      end_min: endMin,
      reason: reason?.trim() || null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    action: "schedule.exception_created",
    entityType: "schedule_exception",
    entityId: exception.id,
    details: { date, mode, startMin, endMin, reason: exception.reason },
    performedBy: "admin",
  });

  // Find active bookings already inside the blocked window.
  const { data: blocked } = await supabase.rpc("blocked_ranges", { p_date: date });
  const { data: dayBookings } = await supabase
    .from("bookings")
    .select("id, client_name, client_phone, status, slot:time_slots(label, start_time, end_time)")
    .eq("booking_date", date)
    .neq("status", "cancelled");
  const ranges = (blocked ?? []) as { start_min: number; end_min: number }[];
  const conflicts = (dayBookings ?? []).filter((b) => {
    const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
    if (!slot) return false;
    const s = toMin(slot.start_time);
    const e = toMin(slot.end_time);
    return ranges.some((r) => s < r.end_min && e > r.start_min);
  });

  return NextResponse.json({ exception, conflicts }, { status: 201 });
}
