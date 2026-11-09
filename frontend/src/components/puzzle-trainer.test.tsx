import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressProvider } from "@/components/progress-provider";
import { PuzzleAttempt } from "@/components/puzzle-attempt";
import { PuzzleTrainer } from "@/components/puzzle-trainer";
import { SoundToggle } from "@/components/sound-toggle";
import type { ReviewMove } from "@/lib/review";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: null }) }));

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function move(overrides: Partial<ReviewMove>): ReviewMove {
  return {
    san: "Qh5",
    ply: 21,
    phase: "middlegame",
    severityCp: 400,
    square: "h5",
    underTimePressure: false,
    fen: START,
    playedUci: "d1h5",
    bestUci: "g1f3",
    bestSan: "Nf3",
    replyUci: "g7g6",
    replySan: "g6",
    gameId: "7",
    ...overrides,
  };
}

function board() {
  return screen.getByRole("group", { name: "White to move. Find the best move." });
}

function square(name: string) {
  return within(board()).getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("PuzzleAttempt", () => {
  it("says not quite, slides the piece back, then accepts the best move from the keyboard", { timeout: 15_000 }, async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, delay: null });
    const onResult = vi.fn();
    render(<PuzzleAttempt move={move({})} orientation="white" onResult={onResult} />);

    expect(screen.getByText("From game 7, move 11. In the game you played Qh5.")).toBeInTheDocument();
    expect(square("a2")).toHaveAccessibleName("a2, white pawn");

    await user.click(square("a2"));
    expect(screen.getByText("a2 selected. Now choose the square to move to.")).toBeInTheDocument();
    await user.click(square("a3"));
    expect(screen.getByRole("status")).toHaveTextContent("Not quite. Try again, or ask for a hint.");
    act(() => {
      vi.advanceTimersByTime(800);
    });

    square("g1").focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowLeft}{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Correct. Nf3 is the best move.");
    expect(screen.getByText("Your game move Qh5 allowed g6.")).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith("missed");
    expect(screen.queryByRole("button", { name: "Hint" })).not.toBeInTheDocument();
  });

  it("counts a first-try answer as solved and reports it once", async () => {
    const user = userEvent.setup({ delay: null });
    const onResult = vi.fn();
    render(<PuzzleAttempt move={move({})} orientation="white" onResult={onResult} />);
    await user.click(square("g1"));
    await user.click(square("f3"));
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("solved");
  });

  it("gives hints in steps: the piece first, then its square, and a hint counts as missed", async () => {
    const user = userEvent.setup({ delay: null });
    const onResult = vi.fn();
    render(<PuzzleAttempt move={move({})} orientation="white" onResult={onResult} />);
    await user.click(screen.getByRole("button", { name: "Hint" }));
    expect(screen.getByRole("status")).toHaveTextContent("Hint: move your knight on g1.");
    expect(screen.queryByText(/f3/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show where it goes" }));
    expect(screen.getByRole("status")).toHaveTextContent("Hint: move your knight from g1 to f3.");
    expect(screen.queryByRole("button", { name: "Show where it goes" })).not.toBeInTheDocument();
    await user.click(square("g1"));
    await user.click(square("f3"));
    expect(screen.getByRole("status")).toHaveTextContent("Correct. Nf3 is the best move.");
    expect(onResult).toHaveBeenCalledWith("missed");
  });

  it("shows the solution on request and counts it as missed", async () => {
    const user = userEvent.setup({ delay: null });
    const onResult = vi.fn();
    render(<PuzzleAttempt move={move({})} orientation="white" onResult={onResult} />);
    await user.click(screen.getByRole("button", { name: "Show solution" }));
    expect(screen.getByRole("status")).toHaveTextContent("The best move was Nf3.");
    expect(onResult).toHaveBeenCalledWith("missed");
  });
});

describe("PuzzleTrainer", () => {
  const moves = [
    move({ gameId: "1", severityCp: 900 }),
    move({ gameId: "2", severityCp: 500 }),
    move({ gameId: "3", phase: "opening", ply: 7, severityCp: 300 }),
  ];

  it("walks through the set, counts results, and ends with a summary", { timeout: 15_000 }, async () => {
    const user = userEvent.setup({ delay: null });
    render(<PuzzleTrainer moves={moves} username="hikaru" />);

    expect(screen.getByRole("heading", { name: "Puzzle 1 of 3" })).toBeInTheDocument();
    expect(screen.getByText("From game 1, move 11. In the game you played Qh5.")).toBeInTheDocument();
    await user.click(square("g1"));
    await user.click(square("f3"));
    expect(screen.getByText("1 solved, 0 missed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next puzzle" }));
    expect(screen.getByRole("heading", { name: "Puzzle 2 of 3" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show solution" }));
    expect(screen.getByText("1 solved, 1 missed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next puzzle" }));
    await user.click(screen.getByRole("button", { name: "Next puzzle" }));
    expect(screen.getByRole("heading", { name: "Set complete" })).toBeInTheDocument();
    expect(screen.getByText("You worked through 3 puzzles and solved 1 on the first try.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByRole("heading", { name: "Puzzle 1 of 3" })).toBeInTheDocument();
    expect(screen.getByText("0 solved, 0 missed")).toBeInTheDocument();
  });

  it("filters by phase and says when a phase has no puzzles", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PuzzleTrainer moves={moves} username="hikaru" />);
    const filters = screen.getByRole("group", { name: "Which puzzles" });
    expect(within(filters).getByRole("button", { name: "Weakest first 3" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(filters).getByRole("button", { name: "Opening 1" }));
    expect(screen.getByRole("heading", { name: "Puzzle 1 of 1" })).toBeInTheDocument();

    await user.click(within(filters).getByRole("button", { name: "Endgame 0" }));
    expect(screen.getByText("No puzzles from this phase yet. Choose another set.")).toBeInTheDocument();
  });
});

describe("PuzzleTrainer with progress (PUZ-06, GAM-02)", () => {
  const moves = [
    move({ gameId: "1", severityCp: 900 }),
    move({ gameId: "2", severityCp: 500 }),
    move({ gameId: "3", phase: "opening", ply: 7, severityCp: 300 }),
  ];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with the due puzzle, hides learned ones, and records the answer for XP", async () => {
    const user = userEvent.setup({ delay: null });
    const posts: string[] = [];
    const progress = (extra: Record<string, unknown>) => ({
      xp: 0,
      rank: "Pawn",
      rank_xp: 0,
      next_rank: "Knight",
      next_rank_xp: 150,
      streak: 0,
      best_streak: 0,
      goal: 3,
      today_solved: 0,
      badges: [],
      learned_by_phase: { opening: 0, middlegame: 1, endgame: 0 },
      lessons_done: [],
      reviewed: 0,
      puzzles: [
        { ref: "1-21", state: "learned", due_on: null },
        { ref: "2-21", state: "due", due_on: "2026-11-08" },
      ],
      ...extra,
    });
    vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(String(input));
        return Promise.resolve(new Response(JSON.stringify(progress({ xp: 10, xp_gained: 10, today_solved: 1 })), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(progress({})), { status: 200 }));
    });
    render(
      <ProgressProvider>
        <PuzzleTrainer moves={moves} username="hikaru" />
      </ProgressProvider>,
    );
    expect(await screen.findByText("1 due today · 1 learned")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Puzzle 1 of 2" })).toBeInTheDocument();
    expect(screen.getByText("Due today")).toBeInTheDocument();
    expect(screen.getByText("From game 2, move 11. In the game you played Qh5.")).toBeInTheDocument();
    await user.click(square("g1"));
    await user.click(square("f3"));
    expect(await screen.findByText("+10 XP · Daily goal 1 of 3")).toBeInTheDocument();
    expect(posts[0]).toMatch(/\/api\/caissa\/me\/activity\/puzzle\/2-21\/solved\?player=hikaru&phase=middlegame&tz=-?\d+$/);
    expect(screen.getByRole("heading", { name: "Pattern mastery" })).toBeInTheDocument();
    expect(screen.getByText("Middlegame: 1 of 2 learned")).toBeInTheDocument();
  });
});

describe("SoundToggle", () => {
  it("turns board sound off and remembers the choice", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SoundToggle />);
    const toggle = screen.getByRole("button", { name: "Sound" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem("caissa-sound")).toBe("off");
  });
});
