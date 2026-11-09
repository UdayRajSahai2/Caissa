import type { HeatPiece } from "@/lib/heat-board";
import { CLOCK_SHARE_ALERT, type PhaseRow, type ReportPhase, type WeaknessReport } from "@/lib/weakness-report";
import { messages } from "@/messages/en";

export type InsightId = "rate" | "phase" | "clock" | "piece" | "square" | "swing";

/** One report card (Section 14.7): headline, one number, one thing to try. */
export type InsightCard = {
  id: InsightId;
  headline: string;
  figure: string;
  action: string;
};

/** One line of the downloadable report. The same lines feed the text file and the PNG (SHR-02). */
export type ExportLine = {
  kind: "title" | "subtitle" | "section" | "headline" | "figure" | "body" | "meta";
  text: string;
};

const PHASE_NAME: Record<ReportPhase, string> = {
  opening: messages.heatOpening,
  middlegame: messages.heatMiddlegame,
  endgame: messages.heatEndgame,
};

const PHASE_ACTION: Record<ReportPhase, string> = {
  opening: messages.insightPhaseActionOpening,
  middlegame: messages.insightPhaseActionMiddlegame,
  endgame: messages.insightPhaseActionEndgame,
};

const PIECE_NAME: Record<HeatPiece, string> = {
  p: messages.piecePawn,
  n: messages.pieceKnight,
  b: messages.pieceBishop,
  r: messages.pieceRook,
  q: messages.pieceQueen,
  k: messages.pieceKing,
};

const NUMBER = new Intl.NumberFormat("en");

/** Fills `{name}` slots in a message template. Numbers get separators; unknown slots are left as written. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (slot, key: string) => {
    const value = values[key];
    if (value === undefined) {
      return slot;
    }
    return typeof value === "number" ? NUMBER.format(value) : value;
  });
}

export function phaseName(id: ReportPhase): string {
  return PHASE_NAME[id];
}

export function phaseAction(id: ReportPhase): string {
  return PHASE_ACTION[id];
}

export function pieceName(piece: HeatPiece): string {
  return PIECE_NAME[piece];
}

export function averageLabel(row: PhaseRow): string {
  return row.averageCp === null ? messages.reportNoAverage : fill(messages.reportAverage, { cp: row.averageCp });
}

export function insightCards(report: WeaknessReport): InsightCard[] {
  if (report.blunders === 0) {
    return [];
  }
  const cards: InsightCard[] = [
    {
      id: "rate",
      headline: fill(messages.insightRateHeadline, { perGame: report.perGame }),
      figure: fill(messages.insightRateFigure, { perGame: report.perGame }),
      action: messages.insightRateAction,
    },
  ];
  if (report.worstPhase) {
    cards.push({
      id: "phase",
      headline: fill(messages.insightPhaseHeadline, { phase: PHASE_NAME[report.worstPhase.id].toLowerCase() }),
      figure: fill(messages.insightPhaseFigure, { share: report.worstPhase.share }),
      action: PHASE_ACTION[report.worstPhase.id],
    });
  }
  const clockHigh = report.pressureShare >= CLOCK_SHARE_ALERT;
  cards.push({
    id: "clock",
    headline: clockHigh ? messages.insightClockHighHeadline : messages.insightClockLowHeadline,
    figure: fill(messages.insightClockFigure, { share: report.pressureShare }),
    action: clockHigh ? messages.insightClockHighAction : messages.insightClockLowAction,
  });
  if (report.piece) {
    const piece = PIECE_NAME[report.piece.id];
    cards.push({
      id: "piece",
      headline: fill(messages.insightPieceHeadline, { piece }),
      figure: fill(messages.insightPieceFigure, { share: report.piece.share, piece }),
      action: fill(messages.insightPieceAction, { piece }),
    });
  }
  if (report.square) {
    cards.push({
      id: "square",
      headline: fill(messages.insightSquareHeadline, { square: report.square.id }),
      figure: fill(messages.insightSquareFigure, { count: report.square.count, square: report.square.id }),
      action: fill(messages.insightSquareAction, { square: report.square.id }),
    });
  }
  if (report.bigSwings > 0) {
    cards.push({
      id: "swing",
      headline: messages.insightSwingHeadline,
      figure: fill(messages.insightSwingFigure, { count: report.bigSwings }),
      action: messages.insightSwingAction,
    });
  }
  return cards;
}

export function exportLines(username: string, report: WeaknessReport, date: string): ExportLine[] {
  const lines: ExportLine[] = [
    { kind: "title", text: fill(messages.reportHeading, { name: username }) },
    { kind: "subtitle", text: fill(messages.reportBasis, { blunders: report.blunders, games: report.games }) },
    { kind: "section", text: messages.reportInsights },
  ];
  for (const card of insightCards(report)) {
    lines.push(
      { kind: "headline", text: card.headline },
      { kind: "figure", text: card.figure },
      { kind: "body", text: `${messages.reportTry} ${card.action}` },
    );
  }
  lines.push({ kind: "section", text: messages.reportPhasesHeading });
  for (const row of report.phases) {
    lines.push({
      kind: "body",
      text: fill(messages.reportPhaseLine, {
        phase: PHASE_NAME[row.id],
        count: row.count,
        share: row.share,
        average: averageLabel(row),
        clock: row.underPressure,
      }),
    });
  }
  if (report.costliest.length > 0) {
    lines.push({ kind: "section", text: messages.reportCostliestHeading });
    for (const move of report.costliest) {
      const loss = move.mate ? messages.reportCostlyMate : fill(messages.reportCostlyLoss, { cp: move.severityCp });
      const better = move.better ? fill(messages.reportBetter, { move: move.better }) : messages.reportBetterMissing;
      const parts = [fill(messages.reportCostlyMove, { move: move.label, game: move.gameId }), loss, better];
      if (move.underTimePressure) {
        parts.push(messages.timePressure);
      }
      lines.push({ kind: "body", text: parts.map(sentence).join(" ") });
    }
  }
  lines.push({ kind: "meta", text: fill(messages.reportMadeWith, { date }) });
  return lines;
}

export function exportText(lines: readonly ExportLine[]): string {
  return `${lines
    .map((line) => (line.kind === "section" ? `\n${line.text}\n${"-".repeat(line.text.length)}` : line.text))
    .join("\n")}\n`;
}

/** Ends a fragment with a full stop unless it already ends a sentence. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function reportFileName(username: string, isoDate: string, extension: "png" | "txt"): string {
  const safe = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `caissa-report-${safe}-${isoDate}.${extension}`;
}
