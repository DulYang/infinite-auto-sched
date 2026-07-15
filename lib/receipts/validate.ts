import type { ExtractedReceipt } from "@/lib/receipts/ocr";

export interface ReceiptCheck {
  field: "amount" | "account_number" | "account_name" | "date" | "receipt";
  ok: boolean;
  // Short human-readable reason (Indonesian), shown to nobody by default but
  // stored in the audit trail so a rejected auto-verify is diagnosable.
  detail: string;
}

export interface ValidationResult {
  valid: boolean;
  checks: ReceiptCheck[];
}

export interface ExpectedReceipt {
  amountDue: number;
  accountNumber: string; // configured BCA account number (BCA_ACCOUNT_NUMBER)
  accountName: string; // configured BCA account holder (BCA_ACCOUNT_NAME)
  // Earliest acceptable transfer date, "YYYY-MM-DD" (booking creation date, Jakarta).
  earliestDate: string;
  // Latest acceptable transfer date, "YYYY-MM-DD" (today, Jakarta) — no future dates.
  latestDate: string;
}

// "YYYY-MM-DD" for a moment in Asia/Jakarta (UTC+7, no DST). Used to fence the
// transfer date so a stale/reused receipt (past) or a fabricated future date
// gets rejected.
export function jakartaDate(d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A single printed-name token matches an expected token, tolerating the partial
// masking some banking apps apply (e.g. "AND**" or "A*I S*E****").
function tokenMatch(expected: string, got: string): boolean {
  if (!expected || !got) return false;
  if (expected === got) return true;
  if (got.includes("*")) {
    // Treat runs of '*' as wildcards; every other char must line up.
    const pattern = "^" + got.split("*").map(escapeRegex).join(".*") + "$";
    if (new RegExp(pattern).test(expected)) return true;
  }
  // Tolerate one side being a prefix of the other (initials / truncation).
  const min = Math.min(expected.length, got.length);
  if (min >= 3 && (expected.startsWith(got) || got.startsWith(expected))) return true;
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Every token of the configured recipient name must be found (masking-tolerant)
// somewhere in the extracted name. This confirms the money went to the right
// person without demanding a byte-perfect match.
export function nameMatches(expected: string, got: string | null): boolean {
  const expTokens = normalizeName(expected).split(" ").filter(Boolean);
  const gotTokens = normalizeName(got).split(" ").filter(Boolean);
  if (expTokens.length === 0 || gotTokens.length === 0) return false;
  return expTokens.every((et) => gotTokens.some((gt) => tokenMatch(et, gt)));
}

// Validates an extracted receipt against what the booking requires. All four
// user-requested checks (amount, BCA number, recipient name, date-not-past)
// must pass, plus a sanity check that the image is a successful transfer at all.
export function validateReceipt(
  extracted: ExtractedReceipt,
  expected: ExpectedReceipt,
): ValidationResult {
  const checks: ReceiptCheck[] = [];

  const isReceipt = extracted.looks_like_transfer_receipt && extracted.transfer_successful !== false;
  checks.push({
    field: "receipt",
    ok: isReceipt,
    detail: isReceipt
      ? "Terlihat sebagai bukti transfer yang berhasil."
      : "Bukan bukti transfer yang berhasil atau tidak terbaca.",
  });

  const amountOk = extracted.amount != null && extracted.amount === expected.amountDue;
  checks.push({
    field: "amount",
    ok: amountOk,
    detail: amountOk
      ? `Jumlah cocok (${expected.amountDue}).`
      : `Jumlah tidak cocok (bukti: ${extracted.amount ?? "?"}, tagihan: ${expected.amountDue}).`,
  });

  const gotAcct = digitsOnly(extracted.destination_account_number);
  const expAcct = digitsOnly(expected.accountNumber);
  const acctOk = expAcct.length > 0 && gotAcct === expAcct;
  checks.push({
    field: "account_number",
    ok: acctOk,
    detail: acctOk ? "Nomor rekening tujuan cocok." : "Nomor rekening tujuan tidak cocok.",
  });

  const nameOk = nameMatches(expected.accountName, extracted.destination_account_name);
  checks.push({
    field: "account_name",
    ok: nameOk,
    detail: nameOk ? "Nama penerima cocok." : "Nama penerima tidak cocok.",
  });

  const td = extracted.transfer_date;
  const dateOk = td != null && /^\d{4}-\d{2}-\d{2}$/.test(td) && td >= expected.earliestDate && td <= expected.latestDate;
  checks.push({
    field: "date",
    ok: dateOk,
    detail: dateOk
      ? "Tanggal transfer valid (tidak kedaluwarsa)."
      : `Tanggal transfer tidak valid (${td ?? "?"}; harus ${expected.earliestDate}..${expected.latestDate}).`,
  });

  return { valid: checks.every((c) => c.ok), checks };
}
