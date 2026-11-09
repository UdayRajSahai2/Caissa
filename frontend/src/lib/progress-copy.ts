import type { BadgeId } from "@/lib/progress";
import { messages } from "@/messages/en";

/** GAM-03: every badge has a plain-text name and says how it is earned. */
export const BADGE_COPY: Record<BadgeId, { name: string; how: string }> = {
  first_solve: { name: messages.badgeFirstSolve, how: messages.badgeFirstSolveHow },
  daily_goal: { name: messages.badgeDailyGoal, how: messages.badgeDailyGoalHow },
  streak_3: { name: messages.badgeStreak3, how: messages.badgeStreak3How },
  streak_7: { name: messages.badgeStreak7, how: messages.badgeStreak7How },
  comeback: { name: messages.badgeComeback, how: messages.badgeComebackHow },
  clean_game: { name: messages.badgeCleanGame, how: messages.badgeCleanGameHow },
  student: { name: messages.badgeStudent, how: messages.badgeStudentHow },
  scholar: { name: messages.badgeScholar, how: messages.badgeScholarHow },
  pattern_fixed: { name: messages.badgePatternFixed, how: messages.badgePatternFixedHow },
};
