import { describe, expect, it } from "vitest";
import { readPlayers } from "@/lib/players";
import { proxyTarget } from "@/lib/proxy-path";
import { afterSignIn, safeCallbackPath } from "@/lib/safe-redirect";
import { contentSecurityPolicy, newNonce, securityHeaders } from "@/lib/security-headers";

const none = new URLSearchParams();

describe("proxy allowlist (AUTH-03)", () => {
  it("forwards only the known API paths, each with its own method", () => {
    expect(proxyTarget("GET", ["library", "hikaru"], none)).toBe("library/hikaru");
    expect(proxyTarget("GET", ["library", "hikaru", "report"], none)).toBe("library/hikaru/report");
    expect(proxyTarget("POST", ["library", "hikaru", "analyze"], none)).toBe("library/hikaru/analyze");
    expect(proxyTarget("GET", ["jobs", "1a53a2d5-a625-4d94-a80f-30b0a6da2d08"], none)).toBe(
      "jobs/1a53a2d5-a625-4d94-a80f-30b0a6da2d08",
    );
    expect(proxyTarget("POST", ["me", "players", "hikaru", "save"], none)).toBe("me/players/hikaru/save");
    expect(proxyTarget("GET", ["me", "players"], none)).toBe("me/players");
  });

  it("refuses other paths, wrong methods, traversal, and odd names", () => {
    expect(proxyTarget("GET", ["health"], none)).toBeNull();
    expect(proxyTarget("GET", ["docs"], none)).toBeNull();
    expect(proxyTarget("POST", ["library", "hikaru"], none)).toBeNull();
    expect(proxyTarget("GET", ["library", "hikaru", "analyze"], none)).toBeNull();
    expect(proxyTarget("GET", ["library", "..", "admin"], none)).toBeNull();
    expect(proxyTarget("GET", ["library", "a b"], none)).toBeNull();
    expect(proxyTarget("POST", ["me", "players", "hikaru", "delete"], none)).toBeNull();
    expect(proxyTarget("POST", ["me", "players", "hikaru", "verify"], none)).toBeNull();
  });

  it("keeps only known query keys with plain values", () => {
    const page = new URLSearchParams({ page: "2", page_size: "10" });
    expect(proxyTarget("GET", ["library", "hikaru", "games"], page)).toBe("library/hikaru/games?page=2&page_size=10");
    expect(proxyTarget("GET", ["library", "hikaru", "games"], new URLSearchParams({ url: "http://evil" }))).toBeNull();
    expect(proxyTarget("GET", ["library", "hikaru", "games"], new URLSearchParams({ page: "1&x=2" }))).toBeNull();
  });

  it("forwards progress routes with only their checked query values (GAM-06)", () => {
    const query = new URLSearchParams({ player: "Magnus_C", phase: "endgame", tz: "-330" });
    expect(proxyTarget("POST", ["me", "activity", "puzzle", "12-31", "solved"], query)).toBe(
      "me/activity/puzzle/12-31/solved?player=Magnus_C&phase=endgame&tz=-330",
    );
    expect(proxyTarget("POST", ["me", "activity", "lesson", "knight-forks", "done"], none)).toBe("me/activity/lesson/knight-forks/done");
    expect(proxyTarget("POST", ["me", "activity", "review", "42", "clean"], none)).toBe("me/activity/review/42/clean");
    expect(proxyTarget("GET", ["me", "progress"], new URLSearchParams({ tz: "60" }))).toBe("me/progress?tz=60");
    expect(proxyTarget("POST", ["me", "progress", "reset"], none)).toBe("me/progress/reset");
    expect(proxyTarget("GET", ["me", "progress", "reset"], none)).toBeNull();
    expect(proxyTarget("POST", ["me", "activity", "puzzle", "12-31", "maybe"], none)).toBeNull();
    expect(proxyTarget("POST", ["me", "activity", "lesson", "Bad_Slug", "done"], none)).toBeNull();
    expect(proxyTarget("GET", ["me", "progress"], new URLSearchParams({ phase: "space" }))).toBeNull();
    expect(proxyTarget("GET", ["me", "progress"], new URLSearchParams({ tz: "12345" }))).toBeNull();
    expect(proxyTarget("GET", ["me", "progress"], new URLSearchParams({ player: "a b" }))).toBeNull();
  });
});

describe("return path after sign-in", () => {
  it("allows only paths on this site", () => {
    expect(safeCallbackPath("/player/hikaru?view=puzzles")).toBe("/player/hikaru?view=puzzles");
    // AUTH-06: sign-in goes through the welcome step, keeping the way back; never another site.
    expect(afterSignIn("/player/hikaru")).toBe("/welcome?next=%2Fplayer%2Fhikaru");
    expect(afterSignIn("https://evil.example/")).toBe("/welcome?next=%2Faccount");
    expect(afterSignIn("/welcome?next=%2Fprogress")).toBe("/welcome?next=%2Fprogress");
    expect(safeCallbackPath("https://evil.example/")).toBe("/account");
    expect(safeCallbackPath("//evil.example")).toBe("/account");
    expect(safeCallbackPath("/\\evil.example")).toBe("/account");
    expect(safeCallbackPath(undefined)).toBe("/account");
  });
});

describe("security headers", () => {
  it("locks scripts to the request nonce, keeps the page on this site, and adds HSTS only in production", () => {
    const csp = contentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*https?:/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(contentSecurityPolicy("abc123", true)).toContain("'unsafe-eval'");
    expect(newNonce()).not.toBe(newNonce());
    expect(newNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    const production = Object.fromEntries(securityHeaders(false).map((header) => [header.key, header.value]));
    expect(production["Content-Security-Policy"]).toBeUndefined();
    expect(production["X-Frame-Options"]).toBe("DENY");
    expect(production["Strict-Transport-Security"]).toContain("max-age=");
    const dev = Object.fromEntries(securityHeaders(true).map((header) => [header.key, header.value]));
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
  });
});

describe("verified players from the API", () => {
  it("keeps only valid usernames", () => {
    expect(readPlayers({ players: ["hikaru", "<b>", 3, "magnus"] })).toEqual(["hikaru", "magnus"]);
    expect(readPlayers(null)).toEqual([]);
    expect(readPlayers({ players: "hikaru" })).toEqual([]);
  });
});
