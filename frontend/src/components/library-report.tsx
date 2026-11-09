"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Activity, CheckCircle2, GraduationCap, Grid3x3, Puzzle, type LucideIcon } from "lucide-react";
import { LibraryHeatmap } from "@/components/library-heatmap";
import { LessonsView } from "@/components/lessons-view";
import { PuzzleTrainer } from "@/components/puzzle-trainer";
import { WeaknessReport } from "@/components/weakness-report";
import { Button } from "@/components/button";
import { FetchLoader } from "@/components/fetch-loader";
import {
  loadLibraryReport,
  pollDelay,
  queueLibraryScore,
  rememberedReport,
  rememberReport,
  sameLibraryReport,
  shouldQueueScore,
  type LibraryReport,
} from "@/lib/library-report";
import { PLAYER_VIEWS as VIEWS, type PlayerView as ReportView } from "@/lib/player";
import { messages } from "@/messages/en";
import styles from "./library-report.module.css";

/** The player's four analysis views as tabs. The open view lives in the URL (NAV-04), so the page owns it. */
export function LibraryReport({
  username,
  view,
  onView,
  refreshKey = 0,
  waiting = false,
}: {
  username: string;
  view: ReportView;
  onView: (view: ReportView) => void;
  refreshKey?: number;
  /** The sync is still checking: show the report only once stored games arrive. */
  waiting?: boolean;
}) {
  const [report, setReport] = useState<LibraryReport | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hasReport = useRef(false);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const headingId = `${baseId}-heading`;

  useEffect(() => {
    // FST-02: a player opened earlier in this tab shows at once, marked as updating.
    const cached = rememberedReport(username);
    hasReport.current = cached !== null;
    setReport(cached);
    setStale(cached !== null);
    setError(null);
  }, [username]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    const queuedAt = { at: 0 };
    if (!hasReport.current) {
      setLoading(true);
    }

    async function tick(isFirst: boolean) {
      try {
        const next = await loadLibraryReport(username, controller.signal);
        if (stopped) {
          return;
        }
        hasReport.current = true;
        rememberReport(username, next);
        setReport((current) => (sameLibraryReport(current, next) ? current : next));
        setStale(false);
        setError(null);
        setLoading(false);
        if (next.gamesScored >= next.gamesTotal) {
          return;
        }
        const now = Date.now();
        if (shouldQueueScore(next.gamesScored, next.gamesTotal, queuedAt.at, now)) {
          queuedAt.at = now;
          await queueLibraryScore(username, controller.signal);
        }
        schedule();
      } catch {
        if (stopped || controller.signal.aborted) {
          return;
        }
        if (isFirst && !hasReport.current) {
          setError(messages.analyzeUnreachable);
          setLoading(false);
          return;
        }
        schedule();
      }
    }

    // FST-01: quick checks first, then a steady pace, until every game is scored.
    function schedule() {
      if (!stopped) {
        timer = window.setTimeout(() => void tick(false), pollDelay(ticks));
        ticks += 1;
      }
    }

    let ticks = 0;
    let timer = 0;
    void tick(true);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [username, attempt, refreshKey]);

  function onTabsKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = VIEWS.findIndex((id) => event.target instanceof Element && event.target.id === tabId(baseId, id));
    if (index < 0) {
      return;
    }
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? VIEWS[(index + 1) % VIEWS.length]
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? VIEWS[(index - 1 + VIEWS.length) % VIEWS.length]
          : event.key === "Home"
            ? VIEWS[0]
            : event.key === "End"
              ? VIEWS[VIEWS.length - 1]
              : null;
    if (!next) {
      return;
    }
    event.preventDefault();
    document.getElementById(tabId(baseId, next))?.focus();
  }

  if (waiting && (report === null || report.gamesTotal === 0)) {
    // The sync is still checking and nothing stored has arrived: one spinner, which goes once results do.
    return <FetchLoader label={messages.playerOpening} />;
  }

  return (
    <section className={styles.features} aria-labelledby={headingId}>
      <h2 id={headingId}>{messages.analysisHeading}</h2>
      <div className={styles.grid} role="tablist" aria-labelledby={headingId} onKeyDown={onTabsKey}>
        <ReportCard
          id={tabId(baseId, "heatmap")}
          panelId={panelId}
          title={messages.heatmapTitle}
          body={messages.heatmapBody}
          Icon={Grid3x3}
          selected={view === "heatmap"}
          tabIndex={view === "heatmap" ? 0 : -1}
          onClick={() => onView("heatmap")}
        />
        <ReportCard
          id={tabId(baseId, "report")}
          panelId={panelId}
          title={messages.reportTitle}
          body={messages.reportBody}
          Icon={Activity}
          selected={view === "report"}
          tabIndex={view === "report" ? 0 : -1}
          onClick={() => onView("report")}
        />
        <ReportCard
          id={tabId(baseId, "puzzles")}
          panelId={panelId}
          title={messages.puzzleTitle}
          body={messages.puzzleBody}
          Icon={Puzzle}
          selected={view === "puzzles"}
          tabIndex={view === "puzzles" ? 0 : -1}
          onClick={() => onView("puzzles")}
        />
        <ReportCard
          id={tabId(baseId, "lessons")}
          panelId={panelId}
          title={messages.lessonsTitle}
          body={messages.lessonsBody}
          Icon={GraduationCap}
          selected={view === "lessons"}
          tabIndex={view === "lessons" ? 0 : -1}
          onClick={() => onView("lessons")}
        />
      </div>
      <div id={panelId} className={styles.panel} role="tabpanel" aria-labelledby={tabId(baseId, view)} aria-busy={loading}>
        <ReportPanel
          view={view}
          stale={stale}
          username={username}
          report={report}
          loading={loading}
          error={error}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      </div>
    </section>
  );
}

function tabId(baseId: string, view: ReportView): string {
  return `${baseId}-${view}`;
}

function ReportCard({
  id,
  panelId,
  title,
  body,
  Icon,
  selected,
  tabIndex,
  onClick,
}: {
  id: string;
  panelId: string;
  title: string;
  body: string;
  Icon: LucideIcon;
  selected: boolean;
  tabIndex: 0 | -1;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      className={styles.action}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={tabIndex}
      onClick={onClick}
    >
      {selected ? (
        <span className={styles.viewing} aria-hidden="true">
          {messages.viewing}
        </span>
      ) : null}
      <h3>
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        {title}
      </h3>
      <span className={styles.body}>{body}</span>
    </button>
  );
}

function progressSentence(report: LibraryReport): string {
  if (report.gamesAnalyzed < report.gamesTotal) {
    return `${messages.libraryScoring} ${report.gamesAnalyzed} ${messages.libraryOf} ${report.gamesTotal} ${messages.libraryOnBoard}`;
  }
  if (report.gamesScored < report.gamesTotal) {
    return `${messages.librarySaving} ${report.gamesScored} ${messages.libraryOf} ${report.gamesTotal} ${messages.libraryReady}`;
  }
  return `${messages.libraryScoredDone} ${report.gamesScored} ${messages.libraryOf} ${report.gamesTotal} ${messages.libraryScored}`;
}

function ReportPanel({
  view,
  stale,
  username,
  report,
  loading,
  error,
  onRetry,
}: {
  view: ReportView;
  stale: boolean;
  username: string;
  report: LibraryReport | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading && !report) {
    return <p role="status">{messages.libraryScoring}</p>;
  }
  if (error && !report) {
    return (
      <div role="alert">
        <p>{error}</p>
        <Button variant="secondary" onClick={onRetry}>
          {messages.libraryRetry}
        </Button>
      </div>
    );
  }
  if (!report) {
    return null;
  }
  const complete = report.gamesScored >= report.gamesTotal && report.gamesTotal > 0;
  return (
    <>
      <div className={styles.progressBlock}>
        <p role="status" className={complete ? styles.done : undefined}>
          {complete ? <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" /> : null}
          {stale ? `${messages.libraryStale} ` : null}
          {progressSentence(report)}
        </p>
        {complete || report.gamesTotal === 0 ? null : (
          <>
            {/* FST-01: real progress, with the numbers in the sentence above. */}
            <progress className={styles.progressBar} max={report.gamesTotal} value={report.gamesScored} aria-hidden="true" />
            <p className={styles.sharpens}>{messages.librarySharpens}</p>
          </>
        )}
      </div>
      {view === "heatmap" ? <LibraryHeatmap moves={report.moves} /> : null}
      {view === "report" ? (
        <WeaknessReport username={username} moves={report.moves} gamesScored={report.gamesScored} />
      ) : null}
      {view === "puzzles" ? <PuzzleTrainer moves={report.moves} username={username} /> : null}
      {view === "lessons" ? <LessonsView moves={report.moves} /> : null}
    </>
  );
}
