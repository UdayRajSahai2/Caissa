"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { pieceSrc } from "@/components/chess-piece";
import { cellsFromFen, type BoardOrientation } from "@/lib/chess-board";
import {
  averageCp,
  heatLegendRanges,
  heatScale,
  heatStep,
  heatStepIndex,
  isDarkSquare,
  nextSquareIndex,
  shareOf,
  squareValue,
  staggerDelay,
  towerLift,
  HEAT_TOP_NUMBERS,
  type HeatMetric,
  type HeatModel,
  type HeatTheme,
} from "@/lib/heat-board";
import { messages } from "@/messages/en";
import styles from "./blunder-board.module.css";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const SETTLE_MS = 400;

export type BoardView = "flat" | "skyline";

export function BlunderBoard({
  model,
  metric,
  orientation,
  selected,
  showPieces,
  view = "flat",
  onSelect,
}: {
  model: HeatModel;
  metric: HeatMetric;
  orientation: BoardOrientation;
  selected: string | null;
  showPieces: boolean;
  view?: BoardView;
  onSelect: (square: string) => void;
}) {
  const [tip, setTip] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const squaresRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const skyline = view === "skyline";
  const [settled, setSettled] = useState(false);
  const theme = useHeatTheme();
  const highContrast = useHighContrast();
  const scale = heatScale(
    model.ranked.map((cell) => squareValue(cell, metric)),
    theme,
    highContrast,
  );
  const cells = cellsFromFen(START_FEN, orientation);
  const numbered = new Set(model.ranked.slice(0, HEAT_TOP_NUMBERS).map((cell) => cell.square));
  const tipCell = tip ? model.bySquare[tip] : undefined;
  const tipIndex = tip ? cells.findIndex((cell) => cell.square === tip) : -1;
  const active = cursor ?? selected ?? model.ranked[0]?.square ?? cells[0]?.square;

  function onBoardKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = cells.findIndex((cell) => cell.square === active);
    const next = index < 0 ? null : nextSquareIndex(index, event.key);
    const square = next === null ? undefined : cells[next]?.square;
    if (!square) {
      return;
    }
    event.preventDefault();
    setCursor(square);
    squaresRef.current?.querySelector<HTMLButtonElement>(`[data-square="${square}"]`)?.focus();
  }

  useEffect(() => {
    setSettled(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSettled(true);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [orientation]);

  return (
    <div className={`${styles.frame} ${skyline ? styles.skyline : ""}`}>
      <div className={styles.ranks} aria-hidden="true">
        {rankLabels(orientation).map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
      <div className={styles.wrap}>
        <p id={hintId} className="visually-hidden">
          {messages.heatBoardHint}
        </p>
        <div
          ref={squaresRef}
          className={`${styles.squares} ${settled ? styles.settled : ""}`}
          role="group"
          aria-label={messages.heatBoardLabel}
          aria-describedby={hintId}
          onKeyDown={onBoardKey}
        >
          {cells.map((cell, index) => {
            const heat = model.bySquare[cell.square];
            const value = heat ? squareValue(heat, metric) : 0;
            const step = heatStep(value, scale);
            const stepIndex = heatStepIndex(value, scale);
            const isSelected = selected === cell.square;
            const showNumber = numbered.has(cell.square) || isSelected || tip === cell.square;
            const label = heat ? squareLabel(cell.square, heat, model, metric) : `${cell.square}: no blunders`;
            const lift = step ? towerLift(value, scale.max) : 0;
            const raised = skyline && lift > 0;
            return (
              <button
                key={cell.square}
                type="button"
                className={[
                  styles.square,
                  isDarkSquare(cell.square) ? styles.tileB : styles.tileA,
                  step ? "" : styles.empty,
                ].filter(Boolean).join(" ")}
                style={{
                  backgroundColor: skyline ? undefined : step?.bg,
                  color: step?.fg,
                  animationDelay: `${staggerDelay(Math.floor(index / 8), index % 8)}ms`,
                }}
                data-square={cell.square}
                tabIndex={cell.square === active ? 0 : -1}
                aria-pressed={isSelected}
                aria-label={label}
                onClick={() => {
                  setCursor(cell.square);
                  onSelect(cell.square);
                }}
                onMouseEnter={() => setTip(cell.square)}
                onMouseLeave={() => setTip((current) => (current === cell.square ? null : current))}
                onFocus={() => {
                  setCursor(cell.square);
                  setTip(cell.square);
                }}
                onBlur={() => setTip((current) => (current === cell.square ? null : current))}
              >
                {showPieces && cell.code && !step && !isSelected ? <GhostPiece code={cell.code} /> : null}
                {raised ? (
                  <Tower
                    lift={lift}
                    color={step?.bg}
                    flag={showNumber && heat ? `${cell.square}: ${metric === "count" ? heat.count : heat.cpLoss}` : null}
                  />
                ) : null}
                {stepIndex !== null && !skyline ? (
                  <span className={styles.dots} aria-hidden="true">
                    {Array.from({ length: stepIndex + 1 }, (_, dot) => (
                      <span key={dot} className={styles.dot} />
                    ))}
                  </span>
                ) : null}
                {showNumber && heat && !skyline ? (
                  <span className={styles.number}>{metric === "count" ? heat.count : heat.cpLoss}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {tip && tipCell && tipIndex >= 0 && !skyline ? (
          <p
            className={styles.tip}
            aria-hidden="true"
            style={{ ["--tip-col" as string]: String(tipIndex % 8), ["--tip-row" as string]: String(Math.floor(tipIndex / 8)) }}
          >
            {squareLabel(tip, tipCell, model, metric)}
          </p>
        ) : null}
      </div>
      <span />
      <div className={styles.files} aria-hidden="true">
        {fileLabels(orientation).map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
      <span />
      <div className={styles.legend} role="group" aria-label={messages.heatLegendLabel}>
        <div className={styles.legendScale}>
          <div className={styles.legendStrip} aria-hidden="true">
            <span className={`${styles.stripCell} ${styles.tileA} ${styles.quietCell}`} />
            {scale.steps.map((step) => (
              <span key={step.bg} className={styles.stripCell} style={{ backgroundColor: step.bg }} />
            ))}
          </div>
          <div className={styles.legendCaptions}>
            <span>
              {messages.heatQuiet}
              <span className={styles.legendValue}>
                {" "}
                ({messages.heatQuietBelow} {Math.ceil(scale.floor)})
              </span>
            </span>
            {heatLegendRanges(scale).map((range, index) => (
              <span key={`${range.low}-${range.high}-${index}`}>
                {heatStepMeaning(index, scale.steps.length)}
                <span className={styles.legendValue}>
                  {" "}
                  ({range.low === range.high ? String(range.low) : `${range.low}–${range.high}`})
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One raised square in the 3D skyline. Decorative: the button around it carries the name and value. */
function Tower({ lift, color, flag }: { lift: number; color: string | undefined; flag: string | null }) {
  return (
    <span
      className={styles.tower}
      aria-hidden="true"
      style={{ ["--lift" as string]: String(lift), ["--tower" as string]: color }}
    >
      <span className={`${styles.face} ${styles.front}`} />
      <span className={`${styles.face} ${styles.side}`} />
      <span className={styles.top}>{flag ? <span className={styles.flag}>{flag}</span> : null}</span>
    </span>
  );
}

function GhostPiece({ code }: { code: string }) {
  const src = pieceSrc(code);
  if (!src) {
    return null;
  }
  return (
    <span
      className={styles.ghost}
      style={{ maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` }}
    />
  );
}

function heatStepMeaning(index: number, stepCount: number): string {
  const meanings = [
    messages.heatLegendLow,
    messages.heatLegendModerate,
    messages.heatLegendHigh,
    messages.heatLegendMost,
  ];
  if (stepCount <= 1) {
    return messages.heatLegendMost;
  }
  const at = Math.round((index / (stepCount - 1)) * (meanings.length - 1));
  return meanings[at] ?? messages.heatLegendMost;
}

function squareLabel(square: string, cell: NonNullable<HeatModel["bySquare"][string]>, model: HeatModel, metric: HeatMetric): string {
  const average = averageCp(cell);
  const loss = average === null ? messages.reviewMate : `${average} centipawns`;
  return `${square}: ${cell.count} blunders, ${shareOf(cell, model, metric)} percent of the total, average ${loss}`;
}

function useHeatTheme(): HeatTheme {
  return useSyncExternalStore(subscribeToTheme, readHeatTheme, () => "light");
}

function subscribeToTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function readHeatTheme(): HeatTheme {
  const choice = document.documentElement.getAttribute("data-theme");
  if (choice === "dark" || choice === "light") {
    return choice;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useHighContrast(): boolean {
  return useSyncExternalStore(subscribeToContrast, readHighContrast, () => false);
}

function subscribeToContrast(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-contrast: more)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readHighContrast(): boolean {
  return window.matchMedia("(prefers-contrast: more)").matches;
}

function rankLabels(orientation: BoardOrientation): number[] {
  return orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
}

function fileLabels(orientation: BoardOrientation): string[] {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  return orientation === "white" ? files : [...files].reverse();
}
