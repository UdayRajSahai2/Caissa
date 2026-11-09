import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BlunderStudy } from "@/components/blunder-study";
import { messages } from "@/messages/en";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const blunders = [
  {
    san: "e4",
    ply: 1,
    phase: "opening",
    severity_cp: 100,
    square: "e4",
    under_time_pressure: false,
    fen: START,
    played_uci: "e2e4",
    best_uci: "g1f3",
    best_san: "Nf3",
  },
  {
    san: "Qh5",
    ply: 5,
    phase: "middlegame",
    severity_cp: 400,
    square: "h5",
    under_time_pressure: true,
    fen: START,
    played_uci: "d1h5",
    best_uci: "g1f3",
    best_san: "Nf3",
  },
];

describe("BlunderStudy", () => {
  it("steps through blunders and then shows the pattern and a puzzle", { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    render(<BlunderStudy blunders={blunders} orientation="white" />);

    expect(screen.getByText("1. e4")).toBeInTheDocument();
    expect(screen.getByText(`${messages.reviewBetter} Nf3.`)).toBeInTheDocument();
    expect(screen.getByText("The move you played from e2 to e4. The better move from g1 to f3.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: messages.reviewNext }));
    expect(screen.getByText("3. Qh5")).toBeInTheDocument();
    expect(screen.queryByText("1. e4")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: messages.reviewPrevious }));
    expect(screen.getByText("1. e4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: messages.showPattern }));
    expect(screen.getByText("The weakest points are the middlegame and the clock.")).toBeInTheDocument();
    expect(screen.getByText("The blunders landed on different squares.")).toBeInTheDocument();
    expect(screen.getByText("White to move. Find the best move.")).toBeInTheDocument();
    expect(screen.getByText(/In the game you played Qh5\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^a2\b/ }));
    await user.click(screen.getByRole("button", { name: /^a3\b/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Not quite. Try again, or ask for a hint.");
    expect(screen.getByRole("button", { name: messages.puzzleHint })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.puzzleShowSolution })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^g1\b/ }));
    await user.click(screen.getByRole("button", { name: /^f3\b/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Correct. Nf3 is the best move.");
    expect(screen.getByText("The move you played from d1 to h5. The better move from g1 to f3.")).toBeInTheDocument();
  });

  it("says when a position was not stored", () => {
    render(
      <BlunderStudy
        blunders={[{ san: "e4", ply: 1, phase: "opening", severity_cp: 20, square: "e4", under_time_pressure: false }]}
        orientation="black"
      />,
    );
    expect(screen.getByText("1. e4")).toBeInTheDocument();
    expect(screen.getByText(messages.reviewNoPosition)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.reviewNext })).toBeDisabled();
  });
});
