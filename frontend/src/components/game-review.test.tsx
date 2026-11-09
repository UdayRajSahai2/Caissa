import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GameReview } from "@/components/game-review";
import type { GameMove } from "@/lib/game-review";
import { messages } from "@/messages/en";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const MOVES: GameMove[] = [
  { ply: 1, san: "e4", uci: "e2e4", fenBefore: START, bestUci: "e2e4", bestSan: "e4", evalCp: 25, evalMate: null, clockSeconds: 180, isPlayerMove: true, isBlunder: false },
  { ply: 2, san: "e5", uci: "e7e5", fenBefore: AFTER_E4, bestUci: "e7e5", bestSan: "e5", evalCp: 25, evalMate: null, clockSeconds: 179, isPlayerMove: false, isBlunder: false },
  { ply: 3, san: "Qh5", uci: "d1h5", fenBefore: AFTER_E5, bestUci: "g1f3", bestSan: "Nf3", evalCp: -320, evalMate: null, clockSeconds: 150, isPlayerMove: true, isBlunder: true },
];

describe("GameReview", () => {
  it("opens before the first blunder and shows both accuracies and the player's counts", () => {
    render(<GameReview gameId="7" moves={MOVES} orientation="white" opponent="magnus" />);
    expect(screen.getByText("Move 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("You (White)")).toBeInTheDocument();
    expect(screen.getByText("magnus (Black)")).toBeInTheDocument();
    const counts = screen.getByText(messages.gameReviewCounts).parentElement!;
    expect(within(counts).getByText(messages.verdictBlunder).parentElement).toHaveTextContent("Blunder1");
  });

  it("steps with the arrow keys, Home, and End, and explains the current move", async () => {
    const user = userEvent.setup({ delay: null });
    render(<GameReview gameId="7" moves={MOVES} orientation="white" opponent="magnus" />);
    const blunder = screen.getByRole("button", { name: "2. Qh5, blunder, 30 seconds" });
    await user.click(blunder);
    expect(blunder).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("The engine's move was Nf3.")).toBeInTheDocument();
    expect(screen.getByText("This move took 30 seconds.")).toBeInTheDocument();
    fireEvent.keyDown(blunder, { key: "Home" });
    expect(screen.getByText(messages.gameReviewStart)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: /1\. e4, best/ }), { key: "ArrowRight" });
    expect(screen.getByText("Move 1 of 3")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: /1\. e4, best/ }), { key: "End" });
    expect(screen.getByText("Move 3 of 3")).toBeInTheDocument();
  });

  it("lists key moments as buttons and names the longest think", async () => {
    const user = userEvent.setup({ delay: null });
    render(<GameReview gameId="7" moves={MOVES} orientation="white" opponent="magnus" />);
    const moments = screen.getByRole("heading", { name: messages.gameReviewMoments }).parentElement!;
    await user.click(within(moments).getByRole("button", { name: /Qh5/ }));
    expect(screen.getByText("Move 3 of 3")).toBeInTheDocument();
    expect(screen.getByText(/Your longest think was 30 seconds on 2\. Qh5 \(blunder\)\./)).toBeInTheDocument();
  });

  it("says when a game has no clock times and renders nothing without moves", () => {
    const noClock = MOVES.map((move) => ({ ...move, clockSeconds: null }));
    const { unmount } = render(<GameReview gameId="7" moves={noClock} orientation="black" opponent="magnus" />);
    expect(screen.getByText(messages.gameReviewNoClock)).toBeInTheDocument();
    unmount();
    const { container } = render(<GameReview gameId="7" moves={[]} orientation="white" opponent="magnus" />);
    expect(container).toBeEmptyDOMElement();
  });
});
