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
      const data = await res.json().catch(() => ({}));
      const message =
        typeof data?.message === "string"
          ? data.message
          : typeof data?.error === "string"
            ? data.error
            : `WAHA error (${res.status})`;
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
