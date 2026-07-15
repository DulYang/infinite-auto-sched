export interface WhatsAppSendResult {
  ok: boolean;
  simulated: boolean;
  error?: string;
}

// Server-side only. Sends via a WAHA (WhatsApp HTTP API) instance connected
// to a real WhatsApp number via a scanned QR session — not the official
// Business Platform, so there's no 24-hour session window or approved
// message templates to worry about; any message can be sent to any number
// at any time, same as chatting normally. Docs: https://waha.devlike.pro
export async function sendWhatsAppMessage(to: string, body: string): Promise<WhatsAppSendResult> {
  const baseUrl = process.env.WAHA_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;
  const session = process.env.WAHA_SESSION || "default";

  if (!baseUrl) {
    // No WAHA instance configured yet. The admin already reviewed and
    // approved the draft by clicking Send, so we log it as sent (copy-paste
    // / manual-send fallback described in docs/ARCHITECTURE.md).
    return { ok: true, simulated: true };
  }

  try {
    // WAHA expects a chatId like "6281234567890@c.us" — digits only, no '+'.
    const chatId = `${to.replace(/\D/g, "")}@c.us`;

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-Api-Key": apiKey } : {}),
      },
      body: JSON.stringify({ session, chatId, text: body }),
    });

    if (!res.ok) {
      // Try structured WAHA error JSON first; fall back to raw response text
      // (e.g. an HTML page from a WAF/reverse-proxy in front of WAHA, which
      // isn't JSON at all) so failures stay diagnosable instead of collapsing
      // into a bare "WAHA error (403)" with no detail.
      const raw = await res.text();
      let message = "";
      try {
        const data = JSON.parse(raw);
        message =
          (typeof data?.message === "string" && data.message) ||
          (typeof data?.error === "string" && data.error) ||
          (data?.exception && typeof data.exception.message === "string" && data.exception.message) ||
          "";
      } catch {
        // Not JSON — use the raw body (truncated) if it has content.
        message = raw.trim().slice(0, 300);
      }
      return { ok: false, simulated: false, error: message || `WAHA error (${res.status})` };
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
