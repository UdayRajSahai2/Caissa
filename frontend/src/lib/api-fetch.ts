import { attemptInput, leadingZeroBits, readChallenge, type BotChallenge } from "@/lib/bot-check-shared";
import { apiBaseUrl } from "@/lib/config";

/** How long the solver may run before giving up: 64 times the expected work. */
const MAX_FACTOR = 64;
let pending: Promise<boolean> | null = null;

/**
 * Every browser call to the API goes through here. When the server asks for the bot check (428), the
 * check is solved once, invisibly, and the call is sent again. Other answers pass straight through.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${apiBaseUrl}/${path}`, init);
  if (response.status !== 428) {
    return response;
  }
  const cleared = await passBotCheck();
  return cleared ? fetch(`${apiBaseUrl}/${path}`, init) : response;
}

/** One solve at a time, shared by every call that is waiting for it. */
export function passBotCheck(): Promise<boolean> {
  pending ??= earnClearance().finally(() => {
    pending = null;
  });
  return pending;
}

async function earnClearance(): Promise<boolean> {
  try {
    const challenge = readChallenge(await (await fetch("/api/bot-check/challenge")).json());
    if (!challenge) {
      return false;
    }
    const nonce = await solveChallenge(challenge);
    if (nonce === null) {
      return false;
    }
    const response = await fetch("/api/bot-check/clearance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge, nonce }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Finds a nonce whose SHA-256 starts with enough zero bits. null when the browser cannot hash or it runs too long. */
export async function solveChallenge(challenge: BotChallenge): Promise<number | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return null;
  }
  const encoder = new TextEncoder();
  const limit = 2 ** challenge.bits * MAX_FACTOR;
  for (let nonce = 0; nonce < limit; nonce += 1) {
    const digest = await subtle.digest("SHA-256", encoder.encode(attemptInput(challenge.salt, nonce)));
    if (leadingZeroBits(new Uint8Array(digest)) >= challenge.bits) {
      return nonce;
    }
    if (nonce % 4096 === 4095) {
      // Let the page breathe so scrolling and typing stay smooth while the check runs.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return null;
}
