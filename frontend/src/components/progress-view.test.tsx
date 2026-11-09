import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonDone } from "@/components/lesson-done";
import { ProgressProvider } from "@/components/progress-provider";
import { ProgressView } from "@/components/progress-view";
import { ProgressSummary } from "@/components/progress-summary";
import { messages } from "@/messages/en";

const session = vi.hoisted(() => ({ status: "authenticated" }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: session.status, data: null }) }));
vi.mock("@/components/sign-in-dialog", () => ({ useSignIn: () => vi.fn() }));

function body(overrides: Record<string, unknown> = {}) {
  return {
    xp: 160,
    rank: "Knight",
    rank_xp: 150,
    next_rank: "Bishop",
    next_rank_xp: 400,
    streak: 4,
    best_streak: 6,
    goal: 3,
    today_solved: 2,
    badges: ["first_solve", "streak_3"],
    learned_by_phase: { opening: 2, middlegame: 0, endgame: 1 },
    lessons_done: [],
    reviewed: 5,
    puzzles: [],
    ...overrides,
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  session.status = "authenticated";
});

describe("progress", () => {
  it("shows rank, streak, goal, and every badge with how to earn it", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo) =>
      Promise.resolve(String(input).includes("me/players") ? json({ players: ["hikaru"] }) : json(body())),
    );
    render(
      <ProgressProvider>
        <ProgressSummary />
        <ProgressView />
      </ProgressProvider>,
    );
    expect(await screen.findByText("160 XP")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Knight");
    const summary = screen.getByRole("region", { name: messages.progressTitle });
    expect(summary).toHaveTextContent("4-day streak");
    expect(summary).toHaveTextContent("2 of 3 puzzles today");
    expect(summary).toHaveTextContent("Knight · 160 XP");
    expect(screen.getByRole("link", { name: "Your progress" })).toHaveAttribute("href", "/progress");
    expect(screen.getByText("240 XP to Bishop")).toBeInTheDocument();
    expect(screen.getByText("4 days")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 puzzles solved")).toBeInTheDocument();
    const badges = screen.getByRole("heading", { name: messages.progressBadges }).parentElement!;
    expect(within(badges).getAllByRole("listitem")).toHaveLength(9);
    expect(within(badges).getByText(messages.badgeStreak7How)).toBeInTheDocument();
    expect(within(badges).getAllByText(messages.progressBadgeEarned)).toHaveLength(2);
    expect(await screen.findByRole("link", { name: messages.progressStartLink })).toHaveAttribute("href", "/player/hikaru?view=puzzles");
  });

  it("asks before deleting progress, and keeps it on cancel", async () => {
    const user = userEvent.setup({ delay: null });
    const calls: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (String(input).includes("me/players")) {
        return Promise.resolve(json({ players: [] }));
      }
      if (String(input).includes("reset")) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(json(body()));
    });
    render(
      <ProgressProvider>
        <ProgressView />
      </ProgressProvider>,
    );
    await user.click(await screen.findByRole("button", { name: messages.progressReset }));
    expect(screen.getByText(messages.progressResetAsk)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: messages.progressResetCancel }));
    expect(calls.some((call) => call.includes("reset"))).toBe(false);
    await user.click(screen.getByRole("button", { name: messages.progressReset }));
    await user.click(screen.getByRole("button", { name: messages.progressResetConfirm }));
    expect(await screen.findByText(messages.progressResetDone)).toBeInTheDocument();
    expect(calls).toContain("POST /api/caissa/me/progress/reset");
  });

  it("marks a lesson done, says the XP, and announces a new badge in a dismissible notice", async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "POST"
          ? json(body({ lessons_done: ["knight-forks"], xp_gained: 25, new_badges: ["student"] }))
          : json(body()),
      ),
    );
    render(
      <ProgressProvider>
        <LessonDone slug="knight-forks" />
      </ProgressProvider>,
    );
    await user.click(await screen.findByRole("button", { name: messages.lessonMarkDone }));
    expect(await screen.findByText("Lesson done. +25 XP")).toBeInTheDocument();
    expect(screen.getByText("Badge earned: Student")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: messages.noticeDismiss }));
    await waitFor(() => expect(screen.queryByText("Badge earned: Student")).not.toBeInTheDocument());
  });

  it("asks signed-out visitors to sign in instead of tracking lessons", () => {
    session.status = "unauthenticated";
    vi.stubGlobal("fetch", () => Promise.resolve(json({}, 401)));
    render(
      <ProgressProvider>
        <LessonDone slug="knight-forks" />
        <ProgressSummary />
      </ProgressProvider>,
    );
    expect(screen.getByRole("button", { name: messages.lessonSignIn })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
