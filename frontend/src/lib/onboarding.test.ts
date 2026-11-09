// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: "github:1001" as string | null }));
vi.mock("@/lib/auth", () => ({ currentUserKey: () => Promise.resolve(state.user) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

import { requireOnboarded, savedPlayers, welcomePath } from "@/lib/onboarding";

function answer(body: unknown, status = 200) {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

beforeEach(() => {
  process.env.CAISSA_API_URL = "http://api.test";
  process.env.CAISSA_INTERNAL_TOKEN = "secret";
  state.user = "github:1001";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("welcome step (AUTH-06)", () => {
  it("sends a user with no saved username to the welcome step, keeping where they were going", async () => {
    vi.stubGlobal("fetch", answer({ players: [] }));
    await expect(requireOnboarded("/player/hikaru")).rejects.toThrow("REDIRECT /welcome?next=%2Fplayer%2Fhikaru");
  });

  it("lets a user with a saved username through, and asks the API with the secret and user key", async () => {
    const fetchMock = answer({ players: ["hikaru"] });
    vi.stubGlobal("fetch", fetchMock);
    await expect(requireOnboarded("/progress")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/me/players");
    expect(init.headers).toMatchObject({ "x-caissa-internal": "secret", "x-caissa-user": "github:1001" });
  });

  it("lets the user through when the API is down or answers an error, instead of trapping them", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    await expect(requireOnboarded("/progress")).resolves.toBeUndefined();
    vi.stubGlobal("fetch", answer({ detail: "x" }, 500));
    await expect(requireOnboarded("/progress")).resolves.toBeUndefined();
  });

  it("asks nothing without a signed-in user", async () => {
    state.user = null;
    const fetchMock = answer({ players: [] });
    vi.stubGlobal("fetch", fetchMock);
    expect(await savedPlayers()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(welcomePath("/player/a b")).toBe("/welcome?next=%2Fplayer%2Fa%20b");
  });
});
