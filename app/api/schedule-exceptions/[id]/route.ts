import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { writeAuditLog } from "@/lib/bookings/audit";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Tidak diotorisasi" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_exceptions")
    .delete()
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Pengecualian tidak ditemukan." }, { status: 404 });

  await writeAuditLog(supabase, {
    action: "schedule.exception_deleted",
    entityType: "schedule_exception",
    entityId: id,
    details: { date: data.exception_date, mode: data.mode },
    performedBy: "admin",
  });
  return NextResponse.json({ ok: true });
}
