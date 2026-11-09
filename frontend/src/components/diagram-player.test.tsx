import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DiagramPlayer } from "@/components/diagram-player";
import { findLesson } from "@/lib/learn";

describe("DiagramPlayer", () => {
  it("starts paused on the position and steps through each move with its notation and caption", async () => {
    const user = userEvent.setup({ delay: null });
    const diagram = findLesson("forks")?.sections[0]?.diagram;
    if (!diagram) {
      throw new Error("fork diagram missing");
    }
    render(<DiagramPlayer diagram={diagram} label="Board: The knight fork" />);

    expect(screen.getByText("Start position")).toBeInTheDocument();
    expect(screen.getByText(diagram.caption)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("Move 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Nc7+")).toBeInTheDocument();
    expect(screen.getByText(/Check, and the rook on a8 is attacked too\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("Nxa8")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous step" }));
    expect(screen.getByText("Move 2 of 3")).toBeInTheDocument();
  });
});
