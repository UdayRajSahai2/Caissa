// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attemptInput, leadingZeroBits, readChallenge, type BotChallenge } from "@/lib/bot-check-shared";
import { clearanceToken, createChallenge, hasClearance, verifySolution } from "@/lib/bot-check-server";
import { startsWork } from "@/lib/proxy-path";

const USER = "github:1001";

function solve(challenge: BotChallenge): number {
  for (let nonce = 0; ; nonce += 1) {
    const digest = createHash("sha256").update(attemptInput(challenge.salt, nonce)).digest();
    if (leadingZeroBits(new Uint8Array(digest)) >= challenge.bits) {
      return nonce;
    }
  }
}

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
  vi.stubEnv("CAISSA_BOT_CHECK_BITS", "8");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bot check (AUTH-05)", () => {
  it("counts leading zero bits across bytes", () => {
    expect(leadingZeroBits(new Uint8Array([0xff]))).toBe(0);
    expect(leadingZeroBits(new Uint8Array([0x0f]))).toBe(4);
    expect(leadingZeroBits(new Uint8Array([0x00, 0x01]))).toBe(15);
    expect(leadingZeroBits(new Uint8Array([0, 0]))).toBe(16);
  });

  it("accepts a correct answer exactly once, for the user it was issued to", () => {
    const challenge = createChallenge(USER);
    const nonce = solve(challenge);
    expect(verifySolution("google:2002", challenge, nonce)).toBe(false);
    expect(verifySolution(USER, challenge, nonce)).toBe(true);
    expect(verifySolution(USER, challenge, nonce)).toBe(false);
  });

  it("rejects a wrong answer, a tampered or easier challenge, an expired one, and odd nonces", () => {
    const challenge = createChallenge(USER);
    const nonce = solve(challenge);
    const wrong = [nonce + 1, nonce + 2, nonce + 3].find(
      (candidate) =>
        leadingZeroBits(new Uint8Array(createHash("sha256").update(attemptInput(challenge.salt, candidate)).digest())) <
        challenge.bits,
    );
    expect(verifySolution(USER, challenge, wrong)).toBe(false);
    expect(verifySolution(USER, { ...challenge, bits: 1 }, nonce)).toBe(false);
    expect(verifySolution(USER, { ...challenge, salt: `${challenge.salt}x` }, nonce)).toBe(false);
    expect(verifySolution(USER, challenge, nonce, challenge.expires + 1)).toBe(false);
    expect(verifySolution(USER, challenge, "1")).toBe(false);
    expect(verifySolution(USER, challenge, -1)).toBe(false);
  });

  it("issues clearance that only works for its own user and only until it expires", () => {
    const now = Date.now();
    const token = clearanceToken(USER, now);
    expect(hasClearance(USER, token, now)).toBe(true);
    expect(hasClearance("google:2002", token, now)).toBe(false);
    expect(hasClearance(USER, token, now + 61 * 60 * 1000)).toBe(false);
    expect(hasClearance(USER, `${token}x`, now)).toBe(false);
    expect(hasClearance(USER, undefined, now)).toBe(false);
    expect(hasClearance(USER, "9999999999.forged", now)).toBe(false);
  });

  it("reads only well-formed challenges", () => {
    expect(readChallenge({ salt: "a", bits: 14, expires: 1, signature: "s" })).not.toBeNull();
    expect(readChallenge({ salt: "a", bits: 99, expires: 1, signature: "s" })).toBeNull();
    expect(readChallenge(null)).toBeNull();
  });

  it("asks for clearance only on calls that start work", () => {
    expect(startsWork("POST", "library/hikaru/analyze")).toBe(true);
    expect(startsWork("GET", "library/hikaru")).toBe(true);
    expect(startsWork("GET", "library/hikaru?page=2&page_size=10")).toBe(true);
    expect(startsWork("GET", "library/hikaru/report")).toBe(false);
    expect(startsWork("GET", "jobs/1a53a2d5-a625-4d94-a80f-30b0a6da2d08")).toBe(false);
    expect(startsWork("GET", "me/players")).toBe(false);
  });
});
