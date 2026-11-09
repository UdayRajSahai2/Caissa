// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = { user: "github:1001" as string | null };

vi.mock("@/lib/auth", () => ({
  currentUserKey: () => Promise.resolve(auth.user),
}));

const { GET, POST } = await import("./route");
const { clearanceToken } = await import("@/lib/bot-check-server");

function call(method: "GET" | "POST", path: string, headers: Record<string, string> = {}) {
  const request = new NextRequest(`http://localhost:3000/api/caissa/${path}`, { method, headers });
  const context = { params: Promise.resolve({ path: path.split("?")[0]?.split("/") ?? [] }) };
  return method === "GET" ? GET(request, context) : POST(request, context);
}

beforeEach(() => {
  auth.user = "github:1001";
  vi.stubEnv("CAISSA_API_URL", "http://api.internal");
  vi.stubEnv("CAISSA_INTERNAL_TOKEN", "server-secret");
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
});

function cleared(extra: Record<string, string> = {}): Record<string, string> {
  return { origin: "http://localhost:3000", cookie: `caissa-clearance=${clearanceToken("github:1001")}`, ...extra };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API proxy", () => {
  it("forwards a signed-in call with the secret and user, and never returns the secret", async () => {
    const upstream = vi.fn((url: string, init: RequestInit) => {
      void url;
      void init;
      return Promise.resolve(new Response('{"players":["hikaru"]}', { status: 200, headers: { "content-type": "application/json" } }));
    });
    vi.stubGlobal("fetch", upstream);
    const response = await call("GET", "me/players");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ players: ["hikaru"] });
    const [url, init] = upstream.mock.calls[0] ?? [];
    expect(url).toBe("http://api.internal/me/players");
    expect(new Headers(init?.headers).get("x-caissa-internal")).toBe("server-secret");
    expect(new Headers(init?.headers).get("x-caissa-user")).toBe("github:1001");
    expect([...response.headers.values()].join(" ")).not.toContain("server-secret");
  });

  it("refuses unknown paths before contacting the API", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await call("GET", "docs")).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    auth.user = null;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await call("GET", "library/hikaru/report");
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses a POST from another site or with no origin", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await call("POST", "library/hikaru/analyze", { origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "library/hikaru/analyze")).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("passes rate limits through and turns an unreachable API into a plain 502", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response('{"detail":"slow down"}', { status: 429, headers: { "retry-after": "12", "content-type": "application/json" } })),
    );
    const limited = await call("POST", "me/players/hikaru/save", cleared());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("12");

    vi.stubGlobal("fetch", () => Promise.reject(new Error("connect ECONNREFUSED")));
    const down = await call("GET", "me/players");
    expect(down.status).toBe(502);
    expect(await down.text()).not.toContain("ECONNREFUSED");
  });

  it("asks for the bot check before any call that starts work, and forwards once cleared", async () => {
    const upstream = vi.fn(() => Promise.resolve(new Response('{"status":"ready"}', { status: 200 })));
    vi.stubGlobal("fetch", upstream);
    const sync = await call("GET", "library/hikaru");
    expect(sync.status).toBe(428);
    const score = await call("POST", "library/hikaru/analyze", { origin: "http://localhost:3000" });
    expect(score.status).toBe(428);
    expect(upstream).not.toHaveBeenCalled();
    const someoneElses = await call("POST", "library/hikaru/analyze", {
      origin: "http://localhost:3000",
      cookie: `caissa-clearance=${clearanceToken("google:2002")}`,
    });
    expect(someoneElses.status).toBe(428);
    expect((await call("POST", "library/hikaru/analyze", cleared())).status).toBe(200);
    expect((await call("GET", "library/hikaru/report")).status).toBe(200);
  });

  it("is unavailable, not open, when the server secret is missing", async () => {
    vi.stubEnv("CAISSA_INTERNAL_TOKEN", "");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await call("GET", "me/players")).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
});
