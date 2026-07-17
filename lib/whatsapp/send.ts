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
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Best-effort human-behavior simulation before a send, per WAHA's anti-ban
// guidance (startTyping → pause scaled to message length → stopTyping →
// send). Bot-like instant sends are one of the signals WhatsApp's anti-spam
// systems key on; a typing window makes the traffic look like a person.
// Failures are swallowed — typing is cosmetic, the message itself matters.
async function simulateTyping(
  normalizedBase: string,
  headers: Record<string, string>,
  session: string,
  chatId: string,
  textLength: number,
) {
  try {
    const body = JSON.stringify({ session, chatId });
    await fetch(`${normalizedBase}/api/startTyping`, { method: "POST", headers, body });
    // ~1.5s base + ~15ms per character, capped at 5s, plus jitter.
    await sleep(Math.min(5000, 1500 + textLength * 15) + Math.random() * 1000);
    await fetch(`${normalizedBase}/api/stopTyping`, { method: "POST", headers, body });
  } catch {
    // Ignore — proceed straight to the send.
  }
}

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

    // Tolerate a WAHA_BASE_URL set without a scheme (e.g. "waha.example.com"),
    // which otherwise makes fetch() throw "Failed to parse URL". Default to
    // https; strip any trailing slash.
    const normalizedBase = (/^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`).replace(
      /\/$/,
      "",
    );

    const headers = {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-Api-Key": apiKey } : {}),
    };

    await simulateTyping(normalizedBase, headers, session, chatId, body.length);

    const res = await fetch(`${normalizedBase}/api/sendText`, {
      method: "POST",
      headers,
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
    // Node's fetch reports network-level failures (DNS, TLS, connection
    // refused) as a bare "fetch failed" and puts the real reason on err.cause.
    // Surface it so problems like an unresolvable host stay diagnosable.
    let message = err instanceof Error ? err.message : "WhatsApp send failed.";
    const cause = (err as { cause?: unknown })?.cause;
    if (cause) {
      const causeMsg =
        cause instanceof Error
          ? cause.message
          : typeof cause === "object" && cause && "code" in cause
            ? String((cause as { code: unknown }).code)
            : String(cause);
      if (causeMsg && causeMsg !== message) message = `${message}: ${causeMsg}`;
    }
    return { ok: false, simulated: false, error: message };
  }
}
