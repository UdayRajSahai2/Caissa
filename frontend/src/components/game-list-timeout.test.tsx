import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameList } from "@/components/game-list";
import { messages } from "@/messages/en";

const poller = vi.hoisted(() => ({
  poll: vi.fn(() => Promise.resolve({ status: "timed_out" as const })),
  cancel: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("@/hooks/use-job-poller", () => ({
  useJobPoller: () => poller,
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GameList score timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says the score timed out instead of claiming the service is down", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/analyze")) {
        return Promise.resolve(json({ status: "queued", job_id: "job-4", game_id: "4" }));
      }
      return Promise.resolve(
        json({
          page: 1,
          page_size: 10,
          total: 1,
          games: [
            {
              id: "4",
              result: "win",
              player_color: "white",
              opponent: "bob",
              time_class: "blitz",
              played_at: null,
              final_fen: "8/8/8/8/8/8/8/8 w - - 0 1",
              analyzed: false,
            },
          ],
        }),
      );
    });

    render(<GameList username="hikaru" />);
    await user.click(await screen.findByRole("button", { name: /bob/i }));
    expect(await screen.findByText(messages.fetchTimedOut)).toBeInTheDocument();
    expect(screen.queryByText(messages.analyzeUnreachable)).not.toBeInTheDocument();
  });
});
