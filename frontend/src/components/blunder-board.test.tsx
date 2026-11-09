import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlunderBoard } from "@/components/blunder-board";
import { HeatInsight } from "@/components/heat-insight";
import type { HeatModel, SquareHeat } from "@/lib/heat-board";

function square(name: string, count: number): SquareHeat {
  return { square: name, count, cpLoss: count * 10, mates: 0, moves: [] };
}

function model(): HeatModel {
  const quiet = square("a1", 4);
  const mid = square("e5", 40);
  const hot = square("f3", 44);
  return {
    bySquare: { a1: quiet, e5: mid, f3: hot },
    ranked: [hot, mid, quiet],
    totalCount: 88,
    totalCp: 880,
    max: 44,
    min: 4,
    floor: 8,
    phases: [
      { id: "opening", value: 1, share: 20 },
      { id: "middlegame", value: 2, share: 50 },
      { id: "endgame", value: 1, share: 30 },
    ],
    takeaway: "Most blunders land on f3.",
  };
}

function squareButton(name: string): HTMLButtonElement {
  const button = screen.getByRole("button", { name: new RegExp(`^${name}:`) });
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${name} is not a button`);
  }
  return button;
}

describe("heatmap selection", () => {
  it("marks the selected square with a ring and keeps its heat fill, so selection never looks like heat", () => {
    const { rerender } = render(
      <BlunderBoard model={model()} metric="count" orientation="white" selected={null} showPieces onSelect={() => undefined} />,
    );
    const hotFill = squareButton("f3").style.backgroundColor;
    expect(hotFill).not.toBe("");

    rerender(
      <BlunderBoard model={model()} metric="count" orientation="white" selected="f3" showPieces onSelect={() => undefined} />,
    );

    const hot = squareButton("f3");
    expect(hot).toHaveAttribute("aria-pressed", "true");
    expect(hot.style.backgroundColor).toBe(hotFill);
    expect(squareButton("e5")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("group", { name: "What the colors mean" })).toBeInTheDocument();
    expect(screen.getByText(/Few or none/)).toBeInTheDocument();
    expect(screen.getByText(/^Most/)).toBeInTheDocument();

    rerender(
      <BlunderBoard model={model()} metric="count" orientation="white" selected="a1" showPieces onSelect={() => undefined} />,
    );

    const quiet = squareButton("a1");
    expect(quiet).toHaveAttribute("aria-pressed", "true");
    expect(quiet.style.backgroundColor).toBe("");
    expect(squareButton("f3")).toHaveAttribute("aria-pressed", "false");
  });

  it("fills the matching hottest-square row when that square is selected", () => {
    render(
      <HeatInsight
        model={model()}
        metric="count"
        color="all"
        selected="f3"
        showPieces
        onMetric={() => undefined}
        onColor={() => undefined}
        onSelect={() => undefined}
        onPieces={() => undefined}
      />,
    );

    const row = screen.getByRole("button", { name: /f3/ });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /e5/ })).toHaveAttribute("aria-pressed", "false");
  });
});
