import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonsView } from "@/components/lessons-view";
import type { ReviewMove } from "@/lib/review";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function move(overrides: Partial<ReviewMove>): ReviewMove {
  return {
    san: "Nf3",
    ply: 21,
    phase: "middlegame",
    severityCp: 340,
    square: "f3",
    underTimePressure: false,
    fen: START,
    playedUci: "g1f3",
    bestUci: "e2e4",
    bestSan: "e4",
    replyUci: "e7e5",
    replySan: "e5",
    gameId: "1",
    ...overrides,
  };
}

const MOVES = [move({}), move({ gameId: "2", ply: 25, underTimePressure: true })];

afterEach(() => {
  vi.useRealTimers();
});

describe("LessonsView", () => {
  it("lists lessons from the player's weaknesses and starts paused on the position", () => {
    render(<LessonsView moves={MOVES} />);
    const list = screen.getByRole("list", { name: "Lessons" });
    expect(list).toHaveTextContent("Middlegame blunders");
    expect(list).toHaveTextContent("Blunders under 30 seconds");
    expect(screen.getByRole("button", { name: "Middlegame blunders 2 examples from your games" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Middlegame blunders" })).toBeInTheDocument();
    expect(screen.getByText("Game 1, move 11. White to move. Look at the position first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
  });

  it("steps through the move, the punishing reply, and the better move", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LessonsView moves={MOVES} />);

    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("You played Nf3. It cost about 3.4 pawns.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("Your opponent's best answer is e5. That is what makes Nf3 a blunder.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("Better was e4. Remember this idea for positions like this one.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
    expect(screen.getByText(/Step 4 of 4/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Next example/ }));
    expect(screen.getByText(/Example 2 of 2/)).toBeInTheDocument();
    expect(screen.getByText("Game 2, move 13. White to move. Look at the position first.")).toBeInTheDocument();
  });

  it("plays the steps on its own after Play, then stops at the end", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, delay: null });
    render(<LessonsView moves={MOVES} />);

    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByText("You played Nf3. It cost about 3.4 pawns.")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(screen.getByText(/That is what makes Nf3 a blunder/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(screen.getByText(/Better was e4/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("explains that lessons need scored games", () => {
    render(<LessonsView moves={[]} />);
    expect(screen.getByText("No lessons yet. Lessons appear once some of your games are scored.")).toBeInTheDocument();
  });
});
