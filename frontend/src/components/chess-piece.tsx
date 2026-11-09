import styles from "./chess-piece.module.css";

const KINDS = new Set(["K", "Q", "R", "B", "N", "P"]);

export function pieceSrc(code: string): string | null {
  const kind = code.toUpperCase();
  if (!KINDS.has(kind)) {
    return null;
  }
  const file = `${code === kind ? "w" : "b"}${kind}`;
  return `/pieces/staunty/${file}.svg`;
}

export function ChessPiece({ code }: { code: string }) {
  const src = pieceSrc(code);
  if (!src) {
    return null;
  }
  return <img className={styles.piece} src={src} alt="" draggable={false} />;
}
