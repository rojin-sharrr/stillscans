/**
 * Short codes are printed on physical objects, so the alphabet drops characters
 * that are easy to misread (0/o, 1/l/i) and codes are lowercase only.
 *
 * This module has no dependencies: the redirect Worker imports it directly.
 */
export const SHORT_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const SHORT_CODE_LENGTH = 6;

const SHORT_CODE_PATTERN = /^[a-hjkmnp-z2-9]{4,12}$/;

/** Never issued: they would read as something official. `test` is the smoke-test code. */
const RESERVED = new Set(["admin", "api", "help", "login", "status", "support", "test", "www"]);

export function isValidShortCode(value: string): boolean {
  return SHORT_CODE_PATTERN.test(value);
}

export function isReservedShortCode(value: string): boolean {
  return RESERVED.has(value);
}

export function generateShortCode(length = SHORT_CODE_LENGTH): string {
  const size = SHORT_CODE_ALPHABET.length;
  // Rejection sampling: a plain modulo would favour the start of the alphabet.
  const limit = 256 - (256 % size);
  let code = "";
  while (code.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && code.length < length) code += SHORT_CODE_ALPHABET[byte % size];
    }
  }
  return code;
}
