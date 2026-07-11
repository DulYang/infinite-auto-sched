import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidE164 } from "@/lib/bookings/phone";

// Public: returns only the name last associated with an exact phone match,
// so the /book form can pre-fill a returning client's name. Bookings SELECT
// stays admin-only; this goes through the narrow lookup_client_name RPC.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = (searchParams.get("phone") ?? "").trim();

  if (!isValidE164(phone)) {
    return NextResponse.json({ name: null });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_client_name", { p_phone: phone });

  if (error) {
    return NextResponse.json({ name: null });
  }

  return NextResponse.json({ name: (data as string | null) ?? null });
}
