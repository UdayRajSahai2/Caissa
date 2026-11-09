"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChessPiece } from "@/components/chess-piece";
import {
  cellsFromFen,
  movePiece,
  readPieces,
  squareCenter,
  squareFromGrid,
  squareGrid,
  type BoardOrientation,
  type BoardPiece,
} from "@/lib/chess-board";
import { nextSquareIndex } from "@/lib/heat-board";
import { arrowEnds, heatLevel } from "@/lib/review";
import styles from "./review-board.module.css";

type Arrow = { uci: string; tone: "blunder" | "best" };

type ReviewBoardProps = {
  fen: string;
  orientation: BoardOrientation;
  arrows?: readonly Arrow[];
  marks?: Record<string, number>;
  label: string;
  travelUci?: string;
  selectedSquare?: string | null;
  hintSquares?: readonly string[];
  wrongSquare?: string | null;
  onSquare?: (square: string) => void;
  /** Dragging is an extra way to move (A11-06): clicking and the keyboard always work too. */
  canDrag?: (square: string) => boolean;
  onDrop?: (from: string, to: string) => void;
};

type Drag = { from: string; code: string; x: number; y: number };

const HEAT = ["", styles.heat1, styles.heat2, styles.heat3] as const;

export function ReviewBoard({
  fen,
  orientation,
  arrows = [],
  marks,
  label,
  travelUci,
  selectedSquare,
  hintSquares = [],
  wrongSquare,
  onSquare,
  canDrag,
  onDrop,
}: ReviewBoardProps) {
  const [arrived, setArrived] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dropped = useRef<string | null>(null);
  const swallowClick = useRef(false);
  const peak = marks ? Math.max(0, ...Object.values(marks)) : 0;
  const base = readPieces(fen);
  // A dropped piece is already where the hand put it, so it lands without sliding.
  const landed = Boolean(travelUci && dropped.current === travelUci.slice(0, 4));
  const moved = (arrived || landed) && travelUci ? movePiece(base, travelUci) : base;
  const pieces = drag ? moved.filter((piece) => piece.square !== drag.from) : moved;
  const traveled = arrowEnds(travelUci ?? "");
  const cells = cellsFromFen(fen, orientation);
  const active = cursor ?? selectedSquare ?? cells[0]?.square;

  useEffect(() => {
    if (!travelUci) {
      dropped.current = null;
      setArrived(false);
      return;
    }
    if (dropped.current === travelUci.slice(0, 4)) {
      setArrived(true);
      return;
    }
    dropped.current = null;
    setArrived(false);
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setArrived(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [fen, travelUci]);

  function onBoardKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = cells.findIndex((cell) => cell.square === active);
    const next = index < 0 ? null : nextSquareIndex(index, event.key);
    const square = next === null ? undefined : cells[next]?.square;
    if (!square) {
      return;
    }
    event.preventDefault();
    setCursor(square);
    boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${square}"]`)?.focus();
  }

  function pointerPoint(event: PointerEvent<HTMLElement>): { square: string; x: number; y: number } | null {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return null;
    }
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const inside = x >= 0 && x < 1 && y >= 0 && y < 1;
    return { square: inside ? squareFromGrid(Math.floor(x * 8), Math.floor(y * 8), orientation) : "", x, y };
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, square: string) {
    const piece = base.find((item) => item.square === square);
    if (!onDrop || !piece || event.button !== 0 || !canDrag?.(square)) {
      return;
    }
    const point = pointerPoint(event);
    // Capture keeps the drag alive when the pointer leaves the square it started on.
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDrag({ from: square, code: piece.code, x: point?.x ?? 0, y: point?.y ?? 0 });
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const point = drag ? pointerPoint(event) : null;
    if (drag && point) {
      setDrag({ ...drag, x: point.x, y: point.y });
    }
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) {
      return;
    }
    const target = pointerPoint(event)?.square ?? "";
    setDrag(null);
    if (!target || target === drag.from || !onDrop) {
      return;
    }
    // The browser still sends a click to the square the drag started on; ignore that one.
    swallowClick.current = true;
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 0);
    dropped.current = `${drag.from}${target}`;
    onDrop(drag.from, target);
  }

  return (
    <div className={styles.frame}>
      <div
        ref={boardRef}
        className={onDrop ? `${styles.board} ${styles.draggable}` : styles.board}
        role={onSquare ? "group" : undefined}
        aria-label={onSquare ? label : undefined}
        aria-hidden={onSquare ? undefined : true}
        onKeyDown={onSquare ? onBoardKey : undefined}
      >
        {cells.map((cell) => {
          const count = marks?.[cell.square] ?? 0;
          const hinted = hintSquares.includes(cell.square);
          const className = [
            styles.square,
            cell.dark ? styles.dark : styles.light,
            HEAT[heatLevel(count, peak)],
            selectedSquare === cell.square ? styles.selected : "",
            hinted ? styles.hint : "",
            wrongSquare === cell.square ? styles.wrong : "",
            traveled && (cell.square === traveled.from || cell.square === traveled.to) ? styles.traveled : "",
          ]
            .filter(Boolean)
            .join(" ");
          const grid = squareGrid(cell.square, orientation);
          const content = (
            <>
              {grid?.file === 0 ? <span className={`${styles.coord} ${styles.rank}`}>{cell.square[1]}</span> : null}
              {grid?.rank === 7 ? <span className={`${styles.coord} ${styles.file}`}>{cell.square[0]}</span> : null}
              {count > 0 ? <span className={styles.badge}>{count}</span> : null}
            </>
          );
          if (onSquare) {
            return (
              <button
                key={cell.square}
                type="button"
                className={className}
                data-square={cell.square}
                tabIndex={cell.square === active ? 0 : -1}
                aria-label={squareName(cell.square, cell.code)}
                aria-pressed={selectedSquare === cell.square}
                onFocus={() => setCursor(cell.square)}
                onClick={() => {
                  if (swallowClick.current) {
                    return;
                  }
                  setCursor(cell.square);
                  onSquare(cell.square);
                }}
                onPointerDown={(event) => startDrag(event, cell.square)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
              >
                {content}
              </button>
            );
          }
          return (
            <span key={cell.square} className={className}>
              {content}
            </span>
          );
        })}
        <svg className={styles.arrows} viewBox="0 0 8 8" aria-hidden="true">
          {arrows.map((arrow) => (
            <ArrowShape key={`${arrow.tone}-${arrow.uci}`} uci={arrow.uci} tone={arrow.tone} orientation={orientation} />
          ))}
        </svg>
        <div className={styles.pieces} aria-hidden="true">
          {pieces.map((piece) => (
            <PlacedPiece
              key={piece.id}
              piece={piece}
              orientation={orientation}
              lifted={selectedSquare === piece.square}
            />
          ))}
          {drag ? (
            <span
              className={`${styles.piece} ${styles.dragging}`}
              style={{ left: `${drag.x * 100}%`, top: `${drag.y * 100}%` }}
            >
              <ChessPiece code={drag.code} />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const PIECE_WORD: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** "e4, white knight", so a screen reader hears what stands on the square, not only its name (A11-08). */
function squareName(square: string, code: string): string {
  if (!code) {
    return square;
  }
  const color = code === code.toUpperCase() ? "white" : "black";
  return `${square}, ${color} ${PIECE_WORD[code.toLowerCase()] ?? ""}`;
}

function PlacedPiece({
  piece,
  orientation,
  lifted,
}: {
  piece: BoardPiece;
  orientation: BoardOrientation;
  lifted: boolean;
}) {
  const grid = squareGrid(piece.square, orientation);
  if (!grid) {
    return null;
  }
  const lift = lifted ? " scale(1.12)" : "";
  return (
    <span
      className={lifted ? `${styles.piece} ${styles.lifted}` : styles.piece}
      style={{ transform: `translate(${grid.file * 100}%, ${grid.rank * 100}%)${lift}` }}
    >
      <ChessPiece code={piece.code} />
    </span>
  );
}

function ArrowShape({
  uci,
  tone,
  orientation,
}: {
  uci: string;
  tone: "blunder" | "best";
  orientation: BoardOrientation;
}) {
  const ends = arrowEnds(uci);
  if (!ends) {
    return null;
  }
  const from = squareCenter(ends.from, orientation);
  const to = squareCenter(ends.to, orientation);
  if (!from || !to) {
    return null;
  }
  const shape = arrowGeometry(from, to);
  if (!shape) {
    return null;
  }
  return (
    <g className={tone === "blunder" ? styles.blunder : styles.best}>
      <line className={styles.halo} x1={shape.start.x} y1={shape.start.y} x2={shape.base.x} y2={shape.base.y} />
      <polygon className={styles.haloHead} points={shape.haloPoints} />
      <line className={styles.shaft} x1={shape.start.x} y1={shape.start.y} x2={shape.base.x} y2={shape.base.y} />
      <polygon className={styles.head} points={shape.points} />
    </g>
  );
}

function arrowGeometry(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.2) {
    return null;
  }
  const ux = dx / length;
  const uy = dy / length;
  const start = { x: from.x + ux * 0.28, y: from.y + uy * 0.28 };
  const tip = { x: to.x - ux * 0.28, y: to.y - uy * 0.28 };
  const head = 0.36;
  const base = { x: tip.x - ux * head, y: tip.y - uy * head };
  const wing = head * 0.42;
  const left = { x: base.x + -uy * wing, y: base.y + ux * wing };
  const right = { x: base.x - -uy * wing, y: base.y - ux * wing };
  const halo = head + 0.1;
  const haloBase = { x: tip.x - ux * halo, y: tip.y - uy * halo };
  const haloWing = halo * 0.5;
  const haloLeft = { x: haloBase.x + -uy * haloWing, y: haloBase.y + ux * haloWing };
  const haloRight = { x: haloBase.x - -uy * haloWing, y: haloBase.y - ux * haloWing };
  return {
    start,
    base,
    points: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`,
    haloPoints: `${tip.x},${tip.y} ${haloLeft.x},${haloLeft.y} ${haloRight.x},${haloRight.y}`,
  };
}
