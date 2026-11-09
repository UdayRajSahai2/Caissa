import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeaknessReport } from "@/components/weakness-report";
import type { ReviewMove } from "@/lib/review";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function move(overrides: Partial<ReviewMove>): ReviewMove {
  return {
    san: "Nf3",
    ply: 21,
    phase: "middlegame",
    severityCp: 300,
    square: "f3",
    underTimePressure: false,
    fen: START,
    playedUci: "g1f3",
    bestUci: "d2d4",
    bestSan: "d4",
    replyUci: "",
    replySan: "",
    gameId: "7",
    ...overrides,
  };
}

const MOVES = [
  move({}),
  move({ ply: 23, severityCp: 10_000, underTimePressure: true, gameId: "8" }),
  move({ ply: 6, phase: "opening", san: "e4", playedUci: "e2e4", severityCp: 180 }),
];

describe("WeaknessReport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("shows insight cards, a phase table, and the costliest blunders", () => {
    render(<WeaknessReport username="hikaru" moves={MOVES} gamesScored={2} />);

    expect(screen.getByRole("heading", { level: 3, name: "Weakness report for hikaru" })).toBeInTheDocument();
    expect(screen.getByText("Based on 3 blunders in 2 scored games.")).toBeInTheDocument();
    const terms = screen.getByText("What do “blunder” and “centipawn” mean?");
    expect(terms.closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByRole("button", { name: /What is a/ })).not.toBeInTheDocument();

    const insights = screen.getByRole("region", { name: "What stands out" });
    expect(within(insights).getByRole("heading", { name: "You blunder about 1.5 times a game" })).toBeInTheDocument();
    expect(within(insights).getByText("67% of all blunders")).toBeInTheDocument();
    expect(within(insights).getAllByText("Try this:")).toHaveLength(within(insights).getAllByRole("listitem").length);

    const table = screen.getByRole("table", { name: "Blunders by phase of the game" });
    const middlegame = within(table).getByRole("row", { name: /Middlegame/ });
    expect(middlegame).toHaveTextContent("2");
    expect(middlegame).toHaveTextContent("67%");
    expect(middlegame).toHaveTextContent("300 centipawns");

    const costliest = screen.getByRole("region", { name: "Your costliest blunders" });
    const items = within(costliest).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("12. Nf3 in game 8");
    expect(items[0]).toHaveTextContent("Allowed mate");
    expect(items[0]).toHaveTextContent("Under 30 seconds");
    expect(items[0]).toHaveTextContent("Better move: d4");
  });

  it("downloads the report as text and says where it went", async () => {
    const user = userEvent.setup();
    const saved: Blob[] = [];
    // jsdom has no object URLs; stand in for the browser's download plumbing.
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        saved.push(blob);
        return "blob:report";
      },
      revokeObjectURL: () => undefined,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<WeaknessReport username="hikaru" moves={MOVES} gamesScored={2} />);

    await user.click(screen.getByRole("button", { name: "Download as text" }));

    expect(saved).toHaveLength(1);
    const text = await saved[0]?.text();
    expect(text).toContain("Weakness report for hikaru");
    expect(text).toContain("Try this:");
    expect(screen.getByRole("status")).toHaveTextContent(/Saved caissa-report-hikaru-\d{4}-\d{2}-\d{2}\.txt\./);
  });

  it("offers the text file when the browser cannot draw the image", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<WeaknessReport username="hikaru" moves={MOVES} gamesScored={2} />);

    await user.click(screen.getByRole("button", { name: "Download image (PNG)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Download the report as text instead.");
    expect(screen.getByRole("button", { name: "Download image (PNG)" })).toBeEnabled();
  });

  it("says plainly when there are no blunders yet", () => {
    render(<WeaknessReport username="hikaru" moves={[]} gamesScored={0} />);
    expect(screen.getByText("No blunders are saved yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
