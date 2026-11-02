const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** 130 bits of randomness. Check results are private, so their ids must be unguessable. */
export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(26)), (byte) => BASE32[byte & 31]).join(
    "",
  );
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
