import { ChessPiece } from "@/components/chess-piece";
import { cellsFromFen } from "@/lib/chess-board";
import styles from "./mini-board.module.css";

export function MiniBoard({ fen, orientation }: { fen: string; orientation: "white" | "black" }) {
  return (
    <div className={styles.board} aria-hidden="true">
      {cellsFromFen(fen, orientation).map((cell) => (
        <span key={cell.square} className={cell.dark ? styles.dark : styles.light}>
          {cell.code ? (
            <span className={styles.piece}>
              <ChessPiece code={cell.code} />
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
