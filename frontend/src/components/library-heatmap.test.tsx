import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LibraryHeatmap } from "@/components/library-heatmap";
import type { ReviewMove } from "@/lib/review";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function blunder(playedUci: string, ply: number, severityCp: number): ReviewMove {
  return {
    san: "Nf3",
    ply,
    phase: "middlegame",
    severityCp,
    square: playedUci.slice(2, 4),
    underTimePressure: false,
    fen: START,
    playedUci,
    bestUci: "",
    bestSan: "",
    replyUci: "",
    replySan: "",
    gameId: "101",
  };
}

const MOVES = [blunder("g1f3", 3, 300), blunder("g1f3", 5, 200), blunder("e2e4", 7, 180)];

function board() {
  return screen.getByRole("group", { name: "Blunder heatmap board" });
}

function square(name: string): HTMLElement {
  return within(board()).getByRole("button", { name: new RegExp(`^${name}:`) });
}

describe("library heatmap", () => {
  it("gives the board one tab stop and moves focus with the arrow keys", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LibraryHeatmap moves={MOVES} />);

    const stops = within(board())
      .getAllByRole("button")
      .filter((button) => button.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(square("f3"));

    square("f3").focus();
    await user.keyboard("{ArrowRight}");
    expect(square("g3")).toHaveFocus();
    expect(square("g3").tabIndex).toBe(0);
    expect(square("f3").tabIndex).toBe(-1);
    await user.keyboard("{ArrowUp}");
    expect(square("g4")).toHaveFocus();
    await user.keyboard("{End}");
    expect(square("h4")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(square("h4")).toHaveFocus();
    // Re-renders 64 buttons per key press; jsdom is slow when the full suite runs in parallel.
  }, 15_000);

  it("announces the drill-down when a square is chosen from the keyboard", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LibraryHeatmap moves={MOVES} />);

    square("f3").focus();
    await user.keyboard("{Enter}");
    expect(square("f3")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("2 blunders on f3. The games are listed in the panel.");

    await user.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Square cleared.");
  });

  it("keeps the same named squares in the 3D skyline view", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LibraryHeatmap moves={MOVES} />);

    await user.click(screen.getByRole("button", { name: "3D skyline" }));
    expect(screen.getByRole("button", { name: "3D skyline" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/taller the tower/)).toBeInTheDocument();
    expect(square("f3")).toHaveAccessibleName(/f3: 2 blunders/);
    expect(within(board()).getAllByRole("button")).toHaveLength(64);
  });

  it("offers a table with the same numbers that drills down to the games", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LibraryHeatmap moves={MOVES} />);

    await user.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table", { name: "Blunders by square, busiest first" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByRole("rowheader")).toHaveTextContent("f3");
    expect(rows[1]).toHaveTextContent("67%");
    expect(rows[1]).toHaveTextContent("250 cp lost");

    await user.click(within(table).getByRole("button", { name: "Show games on e4" }));
    expect(within(table).getByRole("button", { name: "Show games on e4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: /Games on this square e4/ })).toBeInTheDocument();
  });
});
