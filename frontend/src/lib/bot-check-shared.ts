/**
 * AUTH-05 bot check: a small proof of work, solved invisibly in the browser. No puzzle to read or click
 * (WCAG 2.2 SC 3.3.8), no third-party service, no tracking. Shared by the browser solver and the server check.
 */
export type BotChallenge = { salt: string; bits: number; expires: number; signature: string };

/** What gets hashed for one attempt. */
export function attemptInput(salt: string, nonce: number): string {
  return `${salt}:${nonce}`;
}

/** Leading zero bits of a hash: each extra bit doubles the expected work. */
export function leadingZeroBits(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      count += 8;
      continue;
    }
    return count + Math.clz32(byte) - 24;
  }
  return count;
}

export function readChallenge(value: unknown): BotChallenge | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (
    typeof body.salt !== "string" ||
    typeof body.signature !== "string" ||
    typeof body.bits !== "number" ||
    typeof body.expires !== "number" ||
    !Number.isInteger(body.bits) ||
    body.bits < 1 ||
    body.bits > 24
  ) {
    return null;
  }
  return { salt: body.salt, bits: body.bits, expires: body.expires, signature: body.signature };
}
