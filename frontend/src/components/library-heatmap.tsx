"use client";

import { useMemo, useState } from "react";
import { BlunderBoard } from "@/components/blunder-board";
import { HeatInsight } from "@/components/heat-insight";
import { HeatTable } from "@/components/heat-table";
import { Tooltip } from "@/components/tooltip";
import { buildHeat, type HeatColor, type HeatMetric, type HeatModel } from "@/lib/heat-board";
import type { ReviewMove } from "@/lib/review";
import { messages } from "@/messages/en";
import styles from "./library-heatmap.module.css";

type HeatView = "flat" | "skyline" | "table";

const VIEWS: readonly { id: HeatView; label: string }[] = [
  { id: "flat", label: messages.heatViewFlat },
  { id: "skyline", label: messages.heatViewSkyline },
  { id: "table", label: messages.heatViewTable },
];

export function LibraryHeatmap({ moves }: { moves: readonly ReviewMove[] }) {
  const [metric, setMetric] = useState<HeatMetric>("count");
  const [color, setColor] = useState<HeatColor>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [showPieces, setShowPieces] = useState(true);
  const [view, setView] = useState<HeatView>("flat");
  const [announcement, setAnnouncement] = useState("");
  const model = useMemo(() => buildHeat(moves, color, metric), [moves, color, metric]);

  function choose(square: string) {
    const next = selected === square ? null : square;
    setSelected(next);
    setAnnouncement(selectionSentence(next, model));
  }

  return (
    <div className={styles.layout}>
      <p className={styles.intro}>
        <span>{messages.libraryHeatIntro}</span>
        <Tooltip label={messages.centipawnTip} name={messages.centipawnLabel} />
      </p>
      <div className={styles.views}>
        <div className={styles.group} role="group" aria-label={messages.heatView}>
          <p aria-hidden="true">{messages.heatView}</p>
          <div className={styles.switch}>
            {VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                onClick={() => setView(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {view === "skyline" ? <p className={styles.note}>{messages.heatSkylineNote}</p> : null}
      </div>
      {view === "table" ? (
        <HeatTable model={model} metric={metric} selected={selected} onSelect={choose} />
      ) : (
        <BlunderBoard
          model={model}
          metric={metric}
          orientation={color === "black" ? "black" : "white"}
          selected={selected}
          showPieces={showPieces}
          view={view}
          onSelect={choose}
        />
      )}
      <HeatInsight
        model={model}
        metric={metric}
        color={color}
        selected={selected}
        showPieces={showPieces}
        onMetric={setMetric}
        onColor={setColor}
        onSelect={choose}
        onPieces={() => setShowPieces((current) => !current)}
      />
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </div>
  );
}

function selectionSentence(square: string | null, model: HeatModel): string {
  if (!square) {
    return messages.heatAnnounceCleared;
  }
  const count = model.bySquare[square]?.count ?? 0;
  if (count === 0) {
    return `${square}: ${messages.heatNoneHere}`;
  }
  return `${count} ${messages.heatBlunders} ${messages.heatAnnounceOn} ${square}. ${messages.heatAnnounceMore}`;
}
