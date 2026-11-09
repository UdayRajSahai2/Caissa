"use client";

import { useId } from "react";
import { TriangleAlert } from "lucide-react";
import {
  averageCp,
  HEAT_TOP_SQUARES,
  type HeatColor,
  type HeatMetric,
  type HeatModel,
  type SquareHeat,
} from "@/lib/heat-board";
import { messages } from "@/messages/en";
import styles from "./heat-insight.module.css";

const PHASE_LABEL = {
  opening: messages.heatOpening,
  middlegame: messages.heatMiddlegame,
  endgame: messages.heatEndgame,
} as const;

export function HeatInsight({
  model,
  metric,
  color,
  selected,
  showPieces,
  onMetric,
  onColor,
  onSelect,
  onPieces,
}: {
  model: HeatModel;
  metric: HeatMetric;
  color: HeatColor;
  selected: string | null;
  showPieces: boolean;
  onMetric: (metric: HeatMetric) => void;
  onColor: (color: HeatColor) => void;
  onSelect: (square: string) => void;
  onPieces: () => void;
}) {
  const chosen = selected ? model.bySquare[selected] : undefined;
  const hottest = model.ranked.slice(0, HEAT_TOP_SQUARES);
  const gamesHeadingId = useId();

  return (
    <aside className={styles.panel}>
      <p className={styles.takeaway}>{model.takeaway || messages.libraryEmpty}</p>
      <div className={styles.groups}>
        <div className={styles.group} role="group" aria-label={messages.heatMetric}>
          <p>{messages.heatMetric}</p>
          <div className={styles.switch}>
            <button type="button" aria-pressed={metric === "count"} onClick={() => onMetric("count")}>
              {messages.heatCount}
            </button>
            <button type="button" aria-pressed={metric === "cp"} onClick={() => onMetric("cp")}>
              {messages.heatCp}
            </button>
          </div>
        </div>
        <div className={styles.group} role="group" aria-label={messages.heatSide}>
          <p>{messages.heatSide}</p>
          <div className={styles.switch}>
            <button type="button" aria-pressed={color === "all"} onClick={() => onColor("all")}>
              {messages.heatAll}
            </button>
            <button type="button" aria-pressed={color === "white"} onClick={() => onColor("white")}>
              {messages.heatWhite}
            </button>
            <button type="button" aria-pressed={color === "black"} onClick={() => onColor("black")}>
              {messages.heatBlack}
            </button>
          </div>
        </div>
      </div>
      <button type="button" className={styles.pieces} aria-pressed={showPieces} onClick={onPieces}>
        {messages.heatPieces}
      </button>
      <section>
        <h3>{messages.heatTop}</h3>
        {hottest.length === 0 ? <p>{messages.libraryEmpty}</p> : null}
        <ul className={styles.hotList}>
          {hottest.map((cell) => (
            <li key={cell.square}>
              <button
                type="button"
                className={styles.hot}
                aria-pressed={selected === cell.square}
                onClick={() => onSelect(cell.square)}
              >
                <span className={styles.square}>{cell.square}</span>
                <span className={styles.meta}>{hotLabel(cell)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{messages.heatPhases}</h3>
        <ul className={styles.phases}>
          {model.phases.map((phase) => (
            <li key={phase.id}>
              <span>{PHASE_LABEL[phase.id]}</span>
              <span className={styles.track}>
                <span className={styles.fill} style={{ ["--share" as string]: String(phase.share) }} />
              </span>
              <span className={styles.meta}>{phase.share}%</span>
            </li>
          ))}
        </ul>
      </section>
      {selected ? (
        <section className={styles.drill}>
          <h3 id={gamesHeadingId}>
            {messages.heatGames} {selected}
          </h3>
          {!chosen || chosen.moves.length === 0 ? <p>{messages.heatNoneHere}</p> : null}
          {chosen ? (
            // The list scrolls, so it takes focus: keyboard users can scroll it with the arrow keys.
            <ul className={styles.games} tabIndex={0} aria-labelledby={gamesHeadingId}>
              {chosen.moves.map((move) => (
                <li key={`${move.gameId}:${move.ply}`}>
                  <span className={styles.gameLine}>
                    <span className={styles.badge}>
                      <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                      {messages.heatBlunderBadge}
                    </span>
                    <span>
                      {move.label}
                      {move.gameId ? ` · Game ${move.gameId}` : ""}
                    </span>
                  </span>
                  <span className={styles.meta}>
                    {move.mate ? messages.reviewMate : `${move.severityCp} ${messages.heatCpShort}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}

function hotLabel(cell: SquareHeat): string {
  const average = averageCp(cell);
  const loss = average === null ? messages.reviewMate : `${messages.heatAvg} ${average} ${messages.heatCpShort}`;
  return `${cell.count} ${messages.heatBlunders} · ${loss}`;
}
