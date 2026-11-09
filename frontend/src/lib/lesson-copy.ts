import { sideToMove } from "@/lib/chess-board";
import { HEAT_MATE_CP } from "@/lib/heat-board";
import type { Lesson, LessonStepKind } from "@/lib/lesson";
import type { ReviewMove } from "@/lib/review";
import { fill, phaseAction, phaseName, pieceName } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";

export function lessonTitle(lesson: Lesson): string {
  switch (lesson.id) {
    case "phase":
      return fill(messages.lessonPhaseTitle, { phase: phaseName(lesson.phase) });
    case "clock":
      return messages.lessonClockTitle;
    case "piece":
      return fill(messages.lessonPieceTitle, { piece: pieceName(lesson.piece) });
    default: {
      const unreachable: never = lesson;
      return unreachable;
    }
  }
}

/** Why the lesson matters: the same "Try this" advice the weakness report gives. */
export function lessonWhy(lesson: Lesson): string {
  switch (lesson.id) {
    case "phase":
      return phaseAction(lesson.phase);
    case "clock":
      return messages.insightClockHighAction;
    case "piece":
      return fill(messages.insightPieceAction, { piece: pieceName(lesson.piece) });
    default: {
      const unreachable: never = lesson;
      return unreachable;
    }
  }
}

export function sideName(fen: string): string {
  return sideToMove(fen) === "white" ? messages.sideWhite : messages.sideBlack;
}

/** A plain-language caption for each replay step (LSN-02). */
export function lessonCaption(move: ReviewMove, kind: LessonStepKind): string {
  switch (kind) {
    case "position":
      return fill(messages.lessonCaptionPosition, {
        game: move.gameId,
        move: Math.ceil(move.ply / 2),
        side: sideName(move.fen),
      });
    case "played": {
      const cost =
        move.severityCp >= HEAT_MATE_CP
          ? messages.lessonCostMate
          : fill(messages.lessonCost, { pawns: (move.severityCp / 100).toFixed(1) });
      return fill(messages.lessonCaptionPlayed, { san: move.san, cost });
    }
    case "reply":
      return fill(messages.lessonCaptionReply, { reply: move.replySan || move.replyUci, san: move.san });
    case "better":
      return fill(messages.lessonCaptionBetter, { best: move.bestSan || move.bestUci });
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}
