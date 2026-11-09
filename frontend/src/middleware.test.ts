// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = { token: null as Record<string, unknown> | null };

vi.mock("next-auth/jwt", () => ({
  getToken: () => Promise.resolve(session.token),
}));

const { middleware } = await import("./middleware");

afterEach(() => {
  session.token = null;
});

function csp(response: Response): string {
  return response.headers.get("content-security-policy") ?? "";
}

describe("middleware", () => {
  it("gives every page a fresh nonce and a CSP with no inline-script escape hatch", async () => {
    const first = await middleware(new NextRequest("http://localhost:3000/learn"));
    const second = await middleware(new NextRequest("http://localhost:3000/learn"));
    const nonce = /'nonce-([^']+)'/.exec(csp(first))?.[1];
    expect(nonce).toBeTruthy();
    expect(csp(first)).toContain("'strict-dynamic'");
    expect(csp(first)).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp(first)).toContain("frame-ancestors 'none'");
    expect(csp(first)).toContain("worker-src 'self'");
    expect(csp(second)).not.toContain(`'nonce-${nonce}'`);
  });

  it("sends a signed-out visitor from a player page to sign-in, keeping the way back", async () => {
    const response = await middleware(new NextRequest("http://localhost:3000/player/hikaru?view=puzzles"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/signin?callbackUrl=%2Fplayer%2Fhikaru%3Fview%3Dpuzzles",
    );
    expect(csp(response)).toContain("default-src 'self'");
    const progress = await middleware(new NextRequest("http://localhost:3000/progress"));
    expect(progress.status).toBe(307);
    expect(progress.headers.get("location")).toBe("http://localhost:3000/signin?callbackUrl=%2Fprogress");
    expect((await middleware(new NextRequest("http://localhost:3000/welcome"))).status).toBe(307);
  });

  it("lets a signed-in user through and leaves public pages open", async () => {
    session.token = { userKey: "github:1001" };
    expect((await middleware(new NextRequest("http://localhost:3000/account"))).status).toBe(200);
    session.token = null;
    expect((await middleware(new NextRequest("http://localhost:3000/learn/forks"))).status).toBe(200);
    expect((await middleware(new NextRequest("http://localhost:3000/"))).status).toBe(200);
  });
});
