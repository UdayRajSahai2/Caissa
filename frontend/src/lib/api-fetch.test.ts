import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, solveChallenge } from "@/lib/api-fetch";
import { attemptInput, leadingZeroBits } from "@/lib/bot-check-shared";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("passes ordinary answers straight through without any check", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json({ players: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await apiFetch("me/players");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/caissa/me/players", undefined);
  });

  it("solves the bot check on 428, then sends the call again", async () => {
    const challenge = { salt: "salt-1", bits: 4, expires: Date.now() + 60_000, signature: "sig" };
    let cleared = false;
    const calls: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "/api/bot-check/challenge") {
        return Promise.resolve(json(challenge));
      }
      if (url === "/api/bot-check/clearance") {
        const body = JSON.parse(String(init?.body)) as { nonce: number };
        cleared = Number.isInteger(body.nonce);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(cleared ? json({ job_id: "j", status: "queued" }) : json({ detail: "check" }, 428));
    });

    const response = await apiFetch("library/hikaru/analyze", { method: "POST" });
    expect(response.status).toBe(200);
    expect(calls).toEqual([
      "POST /api/caissa/library/hikaru/analyze",
      "GET /api/bot-check/challenge",
      "POST /api/bot-check/clearance",
      "POST /api/caissa/library/hikaru/analyze",
    ]);
  });

  it("returns the original 428 when the check cannot be passed", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo) =>
      Promise.resolve(String(input).endsWith("/challenge") ? json({ bad: true }) : json({ detail: "check" }, 428)),
    );
    const response = await apiFetch("library/hikaru");
    expect(response.status).toBe(428);
  });

  it("finds a nonce whose hash has enough leading zero bits", async () => {
    const challenge = { salt: "abc", bits: 6, expires: Date.now() + 60_000, signature: "s" };
    const nonce = await solveChallenge(challenge);
    expect(nonce).not.toBeNull();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attemptInput("abc", nonce ?? 0)));
    expect(leadingZeroBits(new Uint8Array(digest))).toBeGreaterThanOrEqual(6);
  });
});
