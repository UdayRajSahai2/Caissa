"use client";

import { useId, useState } from "react";
import {
  FileText,
  Gauge,
  ImageDown,
  MapPin,
  Milestone,
  Swords,
  Timer,
  TrendingDown,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/button";
import { MasteryBars } from "@/components/mastery-bars";
import { reportImage, readImageTheme, saveFile } from "@/lib/report-image";
import type { ReviewMove } from "@/lib/review";
import {
  averageLabel,
  exportLines,
  exportText,
  fill,
  insightCards,
  phaseName,
  reportFileName,
  type InsightId,
} from "@/lib/weakness-copy";
import { buildWeaknessReport } from "@/lib/weakness-report";
import { messages } from "@/messages/en";
import styles from "./weakness-report.module.css";

const ICONS: Record<InsightId, LucideIcon> = {
  rate: Gauge,
  phase: Milestone,
  clock: Timer,
  piece: Swords,
  square: MapPin,
  swing: TrendingDown,
};

/** The detailed weakness report (WRP-01, WRP-02) with image and text downloads (SHR-02). */
export function WeaknessReport({
  username,
  moves,
  gamesScored,
}: {
  username: string;
  moves: readonly ReviewMove[];
  gamesScored: number;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [failed, setFailed] = useState(false);
  const baseId = useId();
  const report = buildWeaknessReport(moves, gamesScored);
  const cards = insightCards(report);

  function lines() {
    const now = new Date();
    const date = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(now);
    return { lines: exportLines(username, report, date), isoDate: now.toISOString().slice(0, 10) };
  }

  function downloadText() {
    const { lines: rows, isoDate } = lines();
    const name = reportFileName(username, isoDate, "txt");
    saveFile(new Blob([exportText(rows)], { type: "text/plain;charset=utf-8" }), name);
    setFailed(false);
    setSaved(fill(messages.reportSaved, { file: name }));
  }

  async function downloadImage() {
    if (saving) {
      return;
    }
    setSaving(true);
    setSaved("");
    try {
      const { lines: rows, isoDate } = lines();
      const blob = await reportImage(rows, readImageTheme(document.documentElement));
      if (!blob) {
        setFailed(true);
        return;
      }
      const name = reportFileName(username, isoDate, "png");
      saveFile(blob, name);
      setFailed(false);
      setSaved(fill(messages.reportSaved, { file: name }));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.report}>
      <div className={styles.head}>
        <h3>{fill(messages.reportHeading, { name: username })}</h3>
        <p className={styles.basis}>{fill(messages.reportBasis, { blunders: report.blunders, games: report.games })}</p>
        <details className={styles.terms}>
          <summary>{messages.reportTermsSummary}</summary>
          <dl>
            <dt>{messages.termBlunder}</dt>
            <dd>{messages.blunderTip}</dd>
            <dt>{messages.termCentipawn}</dt>
            <dd>{messages.centipawnTip}</dd>
          </dl>
        </details>
      </div>

      {cards.length === 0 ? (
        <p>{messages.libraryEmpty}</p>
      ) : (
        <section aria-labelledby={`${baseId}-insights`}>
          <h4 id={`${baseId}-insights`}>{messages.reportInsights}</h4>
          <ul className={styles.cards}>
            {cards.map((card) => {
              const Icon = ICONS[card.id];
              return (
                <li key={card.id} className={styles.card}>
                  <h5>
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                    {card.headline}
                  </h5>
                  <p className={styles.figure}>{card.figure}</p>
                  <p>
                    <strong>{messages.reportTry}</strong> {card.action}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {report.blunders > 0 ? (
        <section aria-labelledby={`${baseId}-phases`}>
          <h4 id={`${baseId}-phases`}>{messages.reportPhasesHeading}</h4>
          <div className={styles.scroll} role="region" aria-labelledby={`${baseId}-phases`} tabIndex={0}>
            <table className={styles.table}>
              <caption>{messages.reportPhasesCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{messages.reportPhaseColumn}</th>
                  <th scope="col">{messages.reportCountColumn}</th>
                  <th scope="col">{messages.reportShareColumn}</th>
                  <th scope="col">{messages.reportAverageColumn}</th>
                  <th scope="col">{messages.reportClockColumn}</th>
                </tr>
              </thead>
              <tbody>
                {report.phases.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{phaseName(row.id)}</th>
                    <td>{row.count}</td>
                    <td>{row.share}%</td>
                    <td>{averageLabel(row)}</td>
                    <td>{row.underPressure}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <MasteryBars username={username} moves={moves} />

      {report.costliest.length > 0 ? (
        <section aria-labelledby={`${baseId}-costliest`}>
          <h4 id={`${baseId}-costliest`}>{messages.reportCostliestHeading}</h4>
          <ol className={styles.costliest}>
            {report.costliest.map((move) => (
              <li key={move.key}>
                <span className={styles.moveLine}>
                  <span className={styles.badge}>
                    <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                    {messages.heatBlunderBadge}
                  </span>
                  <span className={styles.move}>
                    {fill(messages.reportCostlyMove, { move: move.label, game: move.gameId })}
                  </span>
                  {move.underTimePressure ? (
                    <span className={styles.clock}>
                      <Timer size={14} strokeWidth={1.75} aria-hidden="true" />
                      {messages.timePressure}
                    </span>
                  ) : null}
                </span>
                <span className={styles.loss}>
                  {move.mate ? messages.reportCostlyMate : fill(messages.reportCostlyLoss, { cp: move.severityCp })}
                </span>
                <span className={styles.better}>
                  {move.better ? fill(messages.reportBetter, { move: move.better }) : messages.reportBetterMissing}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section aria-labelledby={`${baseId}-download`} className={styles.download}>
        <h4 id={`${baseId}-download`}>{messages.reportDownloadHeading}</h4>
        <p className={styles.note}>{messages.reportDownloadNote}</p>
        <div className={styles.actions}>
          <Button onClick={() => void downloadImage()} disabled={saving} aria-busy={saving}>
            <ImageDown size={20} strokeWidth={1.75} aria-hidden="true" />
            {messages.reportDownloadImage}
          </Button>
          <Button variant="secondary" onClick={downloadText}>
            <FileText size={20} strokeWidth={1.75} aria-hidden="true" />
            {messages.reportDownloadText}
          </Button>
        </div>
        <p role="status" className={styles.saved}>
          {saved}
        </p>
        {failed ? (
          <p role="alert" className={styles.failed}>
            <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
            {messages.reportImageFailed}
          </p>
        ) : null}
      </section>
    </div>
  );
}
