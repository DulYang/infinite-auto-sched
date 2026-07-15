import Anthropic from "@anthropic-ai/sdk";

// What Claude extracts from a bank-transfer proof image/PDF. All fields are
// nullable because a receipt may be illegible, cropped, or simply not a bank
// transfer at all — the validator downstream decides what a missing field means.
export interface ExtractedReceipt {
  // Transfer amount in whole rupiah (e.g. "Rp 250.000" -> 250000), or null.
  amount: number | null;
  // Destination/recipient account number, digits only, or null.
  destination_account_number: string | null;
  // Destination/recipient account holder name as printed (may be partially
  // masked with * or x on some bank apps), or null.
  destination_account_name: string | null;
  // Transfer date as ISO "YYYY-MM-DD" in the receipt's local time, or null.
  transfer_date: string | null;
  // Does the image actually look like a completed bank-transfer receipt?
  looks_like_transfer_receipt: boolean;
  // Was the transfer marked successful/berhasil (vs pending/failed)? null if unclear.
  transfer_successful: boolean | null;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    amount: {
      type: ["integer", "null"],
      description: "Transfer amount in whole Indonesian rupiah, digits only (e.g. 250000). Null if not visible.",
    },
    destination_account_number: {
      type: ["string", "null"],
      description: "Recipient/destination account number, digits only. Null if not visible.",
    },
    destination_account_name: {
      type: ["string", "null"],
      description: "Recipient/destination account holder name, exactly as printed (keep any * or x masking). Null if not visible.",
    },
    transfer_date: {
      type: ["string", "null"],
      description: "Date the transfer was made, formatted as YYYY-MM-DD. Null if not visible.",
    },
    looks_like_transfer_receipt: {
      type: "boolean",
      description: "True only if this is a bank transfer receipt / mobile-banking transfer confirmation.",
    },
    transfer_successful: {
      type: ["boolean", "null"],
      description: "True if the transfer is marked successful/berhasil, false if pending/failed, null if unclear.",
    },
  },
  required: [
    "amount",
    "destination_account_number",
    "destination_account_name",
    "transfer_date",
    "looks_like_transfer_receipt",
    "transfer_successful",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You extract structured fields from Indonesian bank-transfer receipts and mobile-banking transfer confirmation screenshots (BCA, and similar). Read only what is visibly printed in the image. Do not guess or infer values that are not shown — return null for anything you cannot read. The "destination" / "recipient" account is where the money was SENT TO (labelled tujuan, penerima, ke, kepada, or similar), never the sender's own account. Amounts must be whole rupiah with no separators. Dates must be YYYY-MM-DD.`;

// Runs Claude vision over a receipt image (or PDF) and returns the extracted
// fields. Throws on API/transport errors so the caller can fall back to manual
// review; never returns partial garbage — an unreadable receipt yields nulls.
export async function extractReceiptFields(
  base64Data: string,
  mediaType: string,
): Promise<ExtractedReceipt> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const model = process.env.RECEIPT_OCR_MODEL || "claude-opus-4-8";

  const isPdf = mediaType === "application/pdf";
  const documentBlock = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64Data },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          // Anthropic vision accepts jpeg/png/webp/gif; anything else we don't send.
          media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: base64Data,
        },
      };

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          {
            type: "text",
            text: "Extract the transfer fields from this payment proof as JSON.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Vision model returned no text content.");
  }

  const parsed = JSON.parse(textBlock.text) as ExtractedReceipt;
  return parsed;
}
