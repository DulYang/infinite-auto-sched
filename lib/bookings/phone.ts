const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone.trim());
}

export const PHONE_FORMAT_ERROR =
  "Enter phone in international format, e.g. +639991234567";
