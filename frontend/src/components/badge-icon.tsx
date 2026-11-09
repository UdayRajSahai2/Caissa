import { Award, BookOpenCheck, CalendarCheck, Flame, GraduationCap, Repeat, ShieldCheck, Target, Zap, type LucideIcon } from "lucide-react";
import type { BadgeId } from "@/lib/progress";

const ICONS: Record<BadgeId, LucideIcon> = {
  first_solve: Zap,
  daily_goal: Target,
  streak_3: Flame,
  streak_7: CalendarCheck,
  comeback: Repeat,
  clean_game: ShieldCheck,
  student: BookOpenCheck,
  scholar: GraduationCap,
  pattern_fixed: Award,
};

/** Decorative: the badge's name is always written next to it (A11-03). */
export function BadgeIcon({ badge, size = 24 }: { badge: BadgeId; size?: number }) {
  const Icon = ICONS[badge];
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
}
