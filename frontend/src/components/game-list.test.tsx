import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameList } from "@/components/game-list";
import { messages } from "@/messages/en";

vi.mock("next/image", () => ({
  default: () => null,
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const emptyPage = { page: 1, page_size: 10, total: 0, games: [] };

describe("GameList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading state and then an empty library", async () => {
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", () => pending);

    render(<GameList username="hikaru" />);
    expect(screen.getByText(messages.fetchingGames)).toBeInTheDocument();
    release(json(emptyPage));
    expect(await screen.findByText(messages.gamesEmpty)).toBeInTheDocument();
  });

  it("shows an error and a retry button when the page fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "nope" }, 500))
      .mockResolvedValueOnce(json(emptyPage));
    vi.stubGlobal("fetch", fetchMock);

    render(<GameList username="hikaru" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.analyzeUnreachable);
    await user.click(screen.getByRole("button", { name: messages.gamesRetry }));
    expect(await screen.findByText(messages.gamesEmpty)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not throw when games is missing", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(json({ page: 1, total: 3 })));
    render(<GameList username="hikaru" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.analyzeUnreachable);
    expect(screen.queryByText(messages.gamesEmpty)).not.toBeInTheDocument();
  });

  it("stops a score poll when the list unmounts", async () => {
    const user = userEvent.setup();
    const game = {
      id: "4",
      result: "win",
      player_color: "white",
      opponent: "bob",
      time_class: "blitz",
      played_at: null,
      final_fen: "8/8/8/8/8/8/8/8 w - - 0 1",
      analyzed: false,
    };
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/jobs/")) {
        signal = init?.signal ?? undefined;
        return new Promise(() => undefined);
      }
      if (url.endsWith("/analyze")) {
        return Promise.resolve(json({ status: "queued", job_id: "job-4", game_id: "4" }));
      }
      return Promise.resolve(json({ page: 1, page_size: 10, total: 1, games: [game] }));
    });

    const view = render(<GameList username="hikaru" />);
    await user.click(await screen.findByRole("button", { name: /bob/i }));
    await waitFor(() => {
      expect(signal).toBeDefined();
    });
    view.unmount();
    await waitFor(() => {
      expect(signal?.aborted).toBe(true);
    });
  });

  it("shows an opponent name as text when it contains markup", async () => {
    const hostile = "<script>alert(1)</script>";
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        json({
          page: 1,
          page_size: 10,
          total: 1,
          games: [game("1", hostile)],
        }),
      ),
    );

    render(<GameList username="hikaru" />);
    const card = await screen.findByRole("button", { name: /script/i });
    expect(card).toHaveTextContent(hostile);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows an error instead of a partial list when one card is malformed", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        json({
          page: 1,
          page_size: 10,
          total: 2,
          games: [game("1", "ann"), { ...game("2", "bob"), analyzed: "yes" }],
        }),
      ),
    );

    render(<GameList username="hikaru" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.analyzeUnreachable);
    expect(screen.queryByRole("button", { name: /ann/i })).not.toBeInTheDocument();
  });

  it("does not call an unknown result a draw", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        json({
          page: 1,
          page_size: 10,
          total: 1,
          games: [{ ...game("1", "bob"), result: "unknown" }],
        }),
      ),
    );

    render(<GameList username="hikaru" />);
    const card = await screen.findByRole("button", { name: /bob/i });
    expect(card).toHaveTextContent(messages.resultUnknown);
    expect(card).not.toHaveTextContent(messages.resultDraw);
  });

  it("still lists the game when the played date is not a real timestamp", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        json({
          page: 1,
          page_size: 10,
          total: 1,
          games: [{ ...game("1", "bob"), played_at: "not-a-date" }],
        }),
      ),
    );

    render(<GameList username="hikaru" />);
    expect(await screen.findByRole("button", { name: /bob/i })).toBeInTheDocument();
  });

  it("shows the score error when that game cannot be opened", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/analyze")) {
        return Promise.resolve(json({ detail: "That game was not found." }, 404));
      }
      return Promise.resolve(json({ page: 1, page_size: 10, total: 1, games: [game("9", "bob")] }));
    });

    render(<GameList username="hikaru" />);
    await user.click(await screen.findByRole("button", { name: /bob/i }));
    expect(await screen.findByText("That game was not found.")).toBeInTheDocument();
    expect(screen.queryByText(messages.blunderNone)).not.toBeInTheDocument();
  });

  it("loads the next page once", async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/games?")) {
        const page = url.includes("page=2") ? 2 : 1;
        const opponent = page === 1 ? "ann" : "zoe";
        return Promise.resolve(
          json({
            page,
            page_size: 10,
            total: 11,
            games: Array.from({ length: page === 1 ? 10 : 1 }, (_, index) => game(String(page * 10 + index), opponent)),
          }),
        );
      }
      return Promise.resolve(json({ status: "ready", username: "hikaru", job_id: null }));
    });

    render(<GameList username="hikaru" />);
    expect(await screen.findByRole("button", { name: messages.gamesNext })).toBeEnabled();
    expect(screen.getByRole("button", { name: messages.gamesPrevious })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: messages.gamesNext }));
    expect(await screen.findByRole("button", { name: /zoe/i })).toBeInTheDocument();
    expect(urls.filter((url) => url.includes("page=2") && !url.includes("/games"))).toHaveLength(1);
  });

  it("does not queue a second download when next is clicked twice", async () => {
    const user = userEvent.setup();
    const pageRequests: string[] = [];
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("page=2") && !url.includes("/games")) {
        pageRequests.push(url);
        return pending;
      }
      if (url.includes("/games?")) {
        return Promise.resolve(
          json({
            page: 1,
            page_size: 10,
            total: 20,
            games: Array.from({ length: 10 }, (_, index) => game(String(index + 1), "ann")),
          }),
        );
      }
      return Promise.resolve(json({ status: "ready", username: "hikaru", job_id: null }));
    });

    render(<GameList username="hikaru" />);
    const next = await screen.findByRole("button", { name: messages.gamesNext });
    await user.click(next);
    await user.click(next);
    expect(pageRequests).toHaveLength(1);
    release(json({ status: "ready", username: "hikaru", job_id: null }));
  });

  it("keeps the last opened game when an earlier score responds late", async () => {
    const user = userEvent.setup();
    let releaseFirst: (response: Response) => void = () => undefined;
    const firstScore = new Promise<Response>((resolve) => {
      releaseFirst = resolve;
    });
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/games/1/analyze")) {
        return firstScore;
      }
      if (url.endsWith("/games/2/analyze")) {
        return Promise.resolve(json({ status: "ready", job_id: null, game_id: "2" }));
      }
      if (url.endsWith("/games/2")) {
        return Promise.resolve(json(detail("2", "Qh5", 5)));
      }
      if (url.endsWith("/games/1")) {
        return Promise.resolve(json(detail("1", "e4", 1)));
      }
      return Promise.resolve(
        json({ page: 1, page_size: 10, total: 2, games: [game("1", "ann"), game("2", "bob")] }),
      );
    });

    render(<GameList username="hikaru" />);
    await user.click(await screen.findByRole("button", { name: /ann/i }));
    await user.click(screen.getByRole("button", { name: /bob/i }));
    expect(await screen.findByText(/Qh5/)).toBeInTheDocument();
    releaseFirst(json({ status: "ready", job_id: null, game_id: "1" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(/bob/i);
    });
    expect(screen.queryByText("1. e4")).not.toBeInTheDocument();
  });
});

function game(id: string, opponent: string) {
  return {
    id,
    result: "win",
    player_color: "white",
    opponent,
    time_class: "blitz",
    played_at: "2026-10-01T00:00:00+00:00",
    final_fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    analyzed: false,
  };
}

function detail(id: string, san: string, ply: number) {
  return {
    id,
    blunders: [
      {
        san,
        ply,
        phase: "opening",
        severity_cp: 200,
        square: "e4",
        under_time_pressure: false,
      },
    ],
  };
}
