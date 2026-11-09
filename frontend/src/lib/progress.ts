/** GAM-01..06, PUZ-06: the signed-in user's progress as the API returns it, and what the UI derives from it. */

import type { ReviewMove } from "@/lib/review";
import { REPORT_PHASES, type ReportPhase } from "@/lib/weakness-report";

export const BADGE_IDS = [
  "first_solve",
  "daily_goal",
  "streak_3",
  "streak_7",
  "comeback",
  "clean_game",
  "student",
  "scholar",
  "pattern_fixed",
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export const RANKS = ["Pawn", "Knight", "Bishop", "Rook", "Queen", "King"] as const;

export type ScheduleState = "due" | "later" | "learned";

export type ProgressData = {
  xp: number;
  rank: string;
  rankXp: number;
  nextRank: string | null;
  nextRankXp: number | null;
  streak: number;
  bestStreak: number;
  goal: number;
  todaySolved: number;
  badges: BadgeId[];
  learnedByPhase: Record<ReportPhase, number>;
  lessonsDone: string[];
  reviewed: number;
  puzzles: { ref: string; state: ScheduleState; dueOn: string | null }[];
  xpGained: number;
  newBadges: BadgeId[];
  newRank: boolean;
};

function isBadge(value: unknown): value is BadgeId {
  return typeof value === "string" && (BADGE_IDS as readonly string[]).includes(value);
}

function isState(value: unknown): value is ScheduleState {
  return value === "due" || value === "later" || value === "learned";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function readProgress(value: unknown): ProgressData | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.xp !== "number" || typeof raw.rank !== "string") {
    return null;
  }
  const learned = typeof raw.learned_by_phase === "object" && raw.learned_by_phase !== null ? (raw.learned_by_phase as Record<string, unknown>) : {};
  const puzzles = Array.isArray(raw.puzzles) ? raw.puzzles : [];
  return {
    xp: count(raw.xp),
    rank: raw.rank,
    rankXp: count(raw.rank_xp),
    nextRank: typeof raw.next_rank === "string" ? raw.next_rank : null,
    nextRankXp: typeof raw.next_rank_xp === "number" ? raw.next_rank_xp : null,
    streak: count(raw.streak),
    bestStreak: count(raw.best_streak),
    goal: count(raw.goal) || 3,
    todaySolved: count(raw.today_solved),
    badges: Array.isArray(raw.badges) ? raw.badges.filter(isBadge) : [],
    learnedByPhase: { opening: count(learned.opening), middlegame: count(learned.middlegame), endgame: count(learned.endgame) },
    lessonsDone: Array.isArray(raw.lessons_done) ? raw.lessons_done.filter((slug): slug is string => typeof slug === "string") : [],
    reviewed: count(raw.reviewed),
    puzzles: puzzles.flatMap((item: unknown) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }
      const entry = item as Record<string, unknown>;
      if (typeof entry.ref !== "string" || !isState(entry.state)) {
        return [];
      }
      return [{ ref: entry.ref, state: entry.state, dueOn: typeof entry.due_on === "string" ? entry.due_on : null }];
    }),
    xpGained: count(raw.xp_gained),
    newBadges: Array.isArray(raw.new_badges) ? raw.new_badges.filter(isBadge) : [],
    newRank: raw.new_rank === true,
  };
}

/** The browser's UTC offset in minutes, so days are the user's local days (GAM implementation note). */
export function timezoneOffset(): number {
  return -new Date().getTimezoneOffset();
}

/** The API's puzzle reference: "<game id>-<ply>". */
export function puzzleRef(move: Pick<ReviewMove, "gameId" | "ply">): string {
  return `${move.gameId}-${move.ply}`;
}

export function scheduleFor(progress: ProgressData | null): Map<string, ScheduleState> {
  return new Map((progress?.puzzles ?? []).map((item) => [item.ref, item.state]));
}

/** Share of the way from this rank to the next, 0 to 100 (100 at the top rank). */
export function rankShare(progress: ProgressData): number {
  if (progress.nextRankXp === null) {
    return 100;
  }
  const span = progress.nextRankXp - progress.rankXp;
  return span <= 0 ? 100 : Math.round(((progress.xp - progress.rankXp) / span) * 100);
}

export type Mastery = { phase: ReportPhase; learned: number; available: number; fixed: boolean };

/** GAM-04: a reachable goal per phase: one full puzzle set, or every puzzle when there are fewer. */
export const MASTERY_GOAL = 15;

/** GAM-04: learned puzzles toward each phase's goal, for every phase that has puzzles. */
export function masteryByPhase(puzzles: readonly ReviewMove[], schedule: Map<string, ScheduleState>): Mastery[] {
  return REPORT_PHASES.flatMap((phase) => {
    const own = puzzles.filter((move) => (move.phase || "opening") === phase);
    if (own.length === 0) {
      return [];
    }
    const goal = Math.min(own.length, MASTERY_GOAL);
    const learned = Math.min(goal, own.filter((move) => schedule.get(puzzleRef(move)) === "learned").length);
    return [{ phase, learned, available: goal, fixed: goal >= 3 && learned >= goal }];
  });
}
