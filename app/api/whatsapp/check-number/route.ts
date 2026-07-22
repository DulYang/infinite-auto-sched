import { NextResponse, type NextRequest } from "next/server";
import { isValidE164 } from "@/lib/bookings/phone";
import { checkPhoneOnWhatsApp } from "@/lib/whatsapp/send";

// Public: lets the /book form verify a client's WhatsApp number BEFORE the
// booking is created, so a typo never reaches WAHA as a real send attempt.
// Messaging a non-existent number is a known WhatsApp anti-spam trigger — it
// got the admin's WAHA session temporarily restricted once already (see
// lib/whatsapp/send.ts, which applies the same guard right before sending).
//
// status:
//   'exists'         — confirmed registered on WhatsApp
//   'not_found'      — confirmed NOT registered (block the booking form)
//   'unknown'        — WAHA not configured, or the check itself failed/timed
//                       out — never block on this, fail open
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = (searchParams.get("phone") ?? "").trim();

  if (!isValidE164(phone)) {
    return NextResponse.json({ status: "unknown" });
  }

  const exists = await checkPhoneOnWhatsApp(phone);
  const status = exists === true ? "exists" : exists === false ? "not_found" : "unknown";
  return NextResponse.json({ status });
}
