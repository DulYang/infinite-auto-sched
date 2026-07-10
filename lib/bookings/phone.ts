const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone.trim());
}

export const PHONE_FORMAT_ERROR =
  "Masukkan nomor telepon dalam format internasional, contoh: +6281234567890";
