import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { attemptInput, leadingZeroBits, type BotChallenge } from "@/lib/bot-check-shared";

/**
 * AUTH-05, server side. A challenge is signed for one user and expires in 5 minutes. A correct answer
 * earns a clearance cookie, also signed for that user, that lasts an hour. Work-starting API calls need it.
 */
export const CLEARANCE_COOKIE = "caissa-clearance";
export const CLEARANCE_SECONDS = 60 * 60;
const CHALLENGE_MS = 5 * 60 * 1000;
/** About 16,000 hashes on average: well under a second in a browser, a real cost for a script farm. */
const DEFAULT_BITS = 14;
const used = new Map<string, number>();

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) {
    throw new Error("NEXTAUTH_SECRET is required for the bot check");
  }
  return value;
}

function sign(...parts: (string | number)[]): string {
  return createHmac("sha256", `caissa-bot-check:${secret()}`).update(parts.join("|")).digest("base64url");
}

function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function challengeBits(): number {
  const configured = Number(process.env.CAISSA_BOT_CHECK_BITS);
  return Number.isInteger(configured) && configured >= 1 && configured <= 24 ? configured : DEFAULT_BITS;
}

export function createChallenge(user: string, now = Date.now()): BotChallenge {
  const salt = randomBytes(16).toString("base64url");
  const bits = challengeBits();
  const expires = now + CHALLENGE_MS;
  return { salt, bits, expires, signature: sign("challenge", salt, bits, expires, user) };
}

/** True once per challenge: signed for this user, not expired, not used before, and the hash has enough zero bits. */
export function verifySolution(user: string, challenge: BotChallenge, nonce: unknown, now = Date.now()): boolean {
  if (typeof nonce !== "number" || !Number.isSafeInteger(nonce) || nonce < 0) {
    return false;
  }
  if (challenge.expires <= now || challenge.bits < challengeBits()) {
    return false;
  }
  if (!sameText(challenge.signature, sign("challenge", challenge.salt, challenge.bits, challenge.expires, user))) {
    return false;
  }
  forgetExpired(now);
  if (used.has(challenge.salt)) {
    return false;
  }
  const digest = createHash("sha256").update(attemptInput(challenge.salt, nonce)).digest();
  if (leadingZeroBits(new Uint8Array(digest)) < challenge.bits) {
    return false;
  }
  used.set(challenge.salt, challenge.expires);
  return true;
}

export function clearanceToken(user: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + CLEARANCE_SECONDS;
  return `${expires}.${sign("clearance", user, expires)}`;
}

export function hasClearance(user: string, token: string | undefined, now = Date.now()): boolean {
  const [expires, signature] = (token ?? "").split(".");
  if (!expires || !signature || !/^\d{1,12}$/.test(expires) || Number(expires) * 1000 <= now) {
    return false;
  }
  return sameText(signature, sign("clearance", user, expires));
}

function forgetExpired(now: number): void {
  for (const [salt, expires] of used) {
    if (expires <= now) {
      used.delete(salt);
    }
  }
}
