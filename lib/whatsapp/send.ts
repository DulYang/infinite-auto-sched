export interface WhatsAppSendResult {
  ok: boolean;
  simulated: boolean;
  error?: string;
}

// Server-side only. Never import this from a client component.
//
// Uses the WhatsApp Business Platform Cloud API directly (Meta), not a
// third-party wrapper. Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Caveat that applies regardless of provider: this sends a free-form text
// message, which Meta only delivers if the client messaged you within the
// last 24 hours OR your number is a Meta-added test recipient. Because
// clients here book via the website (never messaging first), the first
// confirmation to a real client is a business-initiated message and Meta
// requires those to use a pre-approved message TEMPLATE, not free text.
// Register a template ("booking_confirmation" or similar) in Meta Business
// Manager, then switch the request body below from `type: "text"` to
// `type: "template"` once approved.
export async function sendWhatsAppMessage(to: string, body: string): Promise<WhatsAppSendResult> {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    // No WhatsApp API configured. The admin already reviewed and approved
    // the draft by clicking Send, so we log it as sent (copy-paste /
    // manual-send fallback described in docs/ARCHITECTURE.md).
    return { ok: true, simulated: true };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        // Meta expects the destination in E.164 digits with no leading '+'.
        to: to.replace(/^\+/, ""),
        type: "text",
        text: { body },
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message =
        typeof data?.error?.message === "string"
          ? data.error.message
          : `WhatsApp API error (${res.status})`;
      return { ok: false, simulated: false, error: message };
    }

    return { ok: true, simulated: false };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      error: err instanceof Error ? err.message : "WhatsApp send failed.",
    };
  }
}
