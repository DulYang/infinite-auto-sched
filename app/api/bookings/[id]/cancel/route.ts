import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types";

// Public client-facing cancellation. Goes through the phone-gated
// cancel_booking security-definer RPC, so a caller must know both the
// booking id (from their confirmation link) and the phone on the booking.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const phone = (body?.phone as string | undefined)?.trim();

  if (!phone) {
    return NextResponse.json({ error: "Nomor telepon wajib diisi." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_id: id,
    p_phone: phone,
  });

  if (error) {
    if (error.message.includes("unauthorized")) {
      return NextResponse.json({ error: "Nomor telepon tidak cocok." }, { status: 403 });
    }
    if (error.message.includes("not found")) {
      return NextResponse.json({ error: "Pemesanan tidak ditemukan." }, { status: 404 });
    }
    if (error.message.includes("completed")) {
      return NextResponse.json(
        { error: "Tidak dapat membatalkan pemesanan yang sudah selesai." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ booking: data as Booking });
}
