import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { LibraryReport } from "@/components/library-report";
import { forgetReports, rememberReport } from "@/lib/library-report";
import type { PlayerView } from "@/lib/player";
import { messages } from "@/messages/en";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function blunder(ply: number) {
  return {
    game_id: "9",
    san: "e4",
    ply,
    phase: "opening",
    severity_cp: 200,
    square: "e4",
    under_time_pressure: false,
    fen: START,
    played_uci: "e2e4",
    best_uci: "g1f3",
    best_san: "Nf3",
  };
}

const report = {
  username: "hikaru",
  games_total: 2,
  games_analyzed: 2,
  games_scored: 2,
  blunders: [blunder(1), blunder(3)],
};

/** Holds the open view the way the dashboard keeps it in the URL. */
function Harness({ start = "heatmap" as PlayerView, onView }: { start?: PlayerView; onView?: (view: PlayerView) => void }) {
  const [view, setView] = useState<PlayerView>(start);
  return (
    <LibraryReport
      username="hikaru"
      view={view}
      onView={(next) => {
        onView?.(next);
        setView(next);
      }}
    />
  );
}

describe("LibraryReport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // FST-02 remembers reports per tab; each test starts with none.
    forgetReports();
  });

  it("shows the last report at once on return, marked as updating, then the fresh one (FST-02)", async () => {
    rememberReport("hikaru", { gamesTotal: 2, gamesAnalyzed: 1, gamesScored: 1, moves: [] });
    let answer: (value: Response) => void = () => undefined;
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => (answer = resolve)));
    render(<Harness />);
    expect(screen.getByText(/Showing your last report\. Updating…/)).toBeInTheDocument();
    expect(screen.getByText(messages.librarySharpens)).toBeInTheDocument();
    answer(json(report));
    await waitFor(() => expect(screen.queryByText(/Showing your last report/)).not.toBeInTheDocument());
    expect(screen.queryByText(messages.librarySharpens)).not.toBeInTheDocument();
  });

  it("opens on the heatmap and tells the page when another view is chosen", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", () => Promise.resolve(json(report)));
    const onView = vi.fn();
    render(<Harness onView={onView} />);
    expect(screen.getByRole("tab", { name: /Blunder heatmap/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: /Lessons from your games/ }));
    expect(onView).toHaveBeenCalledWith("lessons");
    await user.click(screen.getByRole("tab", { name: /Lessons from your games/ }));
    expect(screen.getByRole("tab", { name: /Lessons from your games/ })).toHaveAttribute("aria-selected", "true");
  });

  it("shows where blunders landed across the scored games", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/report")) {
        return Promise.resolve(json(report));
      }
      return Promise.resolve(json({ status: "ready", queued: 0 }));
    });
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /Blunder heatmap/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(messages.viewing)).toBeInTheDocument();
    expect(
      await screen.findByText("You lose most material on e4, mostly with pawns in the opening."),
    ).toBeInTheDocument();
    const help = screen.getByRole("button", { name: messages.centipawnLabel });
    expect(help).toHaveAttribute("aria-expanded", "false");
    await user.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tooltip")).toHaveTextContent(messages.centipawnTip);
    await user.keyboard("{Escape}");
    expect(help).toHaveAttribute("aria-expanded", "false");
    await user.click(help);
    await user.click(screen.getByRole("heading", { name: messages.analysisHeading }));
    expect(help).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /e4: 2 blunders/ })).toBeInTheDocument();
    expect(screen.getByText("Analysis complete. 2 of 2 games scored.")).toBeInTheDocument();
  });

  it("opens the detailed weakness report for the scored games", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", () => Promise.resolve(json(report)));
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: /Weakness report/ }));
    expect(screen.getByRole("tab", { name: /Weakness report/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Blunder heatmap/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /Your own puzzles/ })).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("heading", { name: "Weakness report for hikaru" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Most of your blunders come in the opening" })).toBeInTheDocument();
  });

  it("shows an error and retries the report", async () => {
    const user = userEvent.setup();
    let calls = 0;
    vi.stubGlobal("fetch", () => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve(json(report));
    });
    render(<Harness start="puzzles" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.analyzeUnreachable);
    await user.click(screen.getByRole("button", { name: messages.libraryRetry }));
    expect(await screen.findByRole("heading", { name: /Puzzle 1 of/ })).toBeInTheDocument();
    await waitFor(() => expect(calls).toBeGreaterThan(1));
  });
});
