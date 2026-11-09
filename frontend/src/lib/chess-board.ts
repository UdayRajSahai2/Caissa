const FILES = "abcdefgh";
const SQUARE = /^[a-h][1-8]$/;

export type BoardCell = {
  code: string;
  dark: boolean;
  white: boolean;
  square: string;
};

export type BoardPiece = {
  id: string;
  code: string;
  square: string;
  white: boolean;
};

export type BoardOrientation = "white" | "black";

export function cellsFromFen(fen: string, orientation: BoardOrientation): BoardCell[] {
  const ranks = (fen.split(" ")[0] ?? "").split("/");
  const board = ranks.map(expandRank);
  const rankOrder = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const fileOrder = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const drawn: BoardCell[] = [];
  for (const rank of rankOrder) {
    for (const file of fileOrder) {
      const piece = board[8 - rank]?.[file] ?? "";
      drawn.push({
        code: piece,
        dark: (file + rank) % 2 === 0,
        white: piece !== "" && piece === piece.toUpperCase(),
        square: `${FILES[file]}${rank}`,
      });
    }
  }
  return drawn;
}

export function squareCenter(
  square: string,
  orientation: BoardOrientation,
): { x: number; y: number } | null {
  if (!SQUARE.test(square)) {
    return null;
  }
  const file = FILES.indexOf(square[0] ?? "");
  const rank = Number(square[1]);
  if (orientation === "white") {
    return { x: file + 0.5, y: 8 - rank + 0.5 };
  }
  return { x: 7 - file + 0.5, y: rank - 1 + 0.5 };
}

export function readPieces(fen: string): BoardPiece[] {
  const ranks = (fen.split(" ")[0] ?? "").split("/");
  const pieces: BoardPiece[] = [];
  ranks.forEach((rank, rankIndex) => {
    let file = 0;
    for (const char of rank) {
      const empty = Number(char);
      if (empty > 0) {
        file += empty;
        continue;
      }
      const square = `${FILES[file] ?? ""}${8 - rankIndex}`;
      pieces.push({
        id: square,
        code: char,
        square,
        white: char === char.toUpperCase(),
      });
      file += 1;
    }
  });
  return pieces;
}

export function sideToMove(fen: string): BoardOrientation {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

export function ownsSquare(fen: string, square: string): boolean {
  const piece = readPieces(fen).find((item) => item.square === square);
  if (!piece) {
    return false;
  }
  return piece.white === (sideToMove(fen) === "white");
}

export function movePiece(pieces: readonly BoardPiece[], uci: string): BoardPiece[] {
  if (uci.length < 4) {
    return [...pieces];
  }
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci[4];
  const mover = pieces.find((piece) => piece.square === from);
  if (!mover) {
    return [...pieces];
  }
  const captured = pieces.some((piece) => piece.square === to);
  let rest = pieces.filter((piece) => piece.id !== mover.id && piece.square !== to);
  if (mover.code.toLowerCase() === "p" && from[0] !== to[0] && !captured) {
    const passed = `${to[0] ?? ""}${from[1] ?? ""}`;
    rest = rest.filter((piece) => piece.square !== passed);
  }
  let code = mover.code;
  if (promotion && mover.code.toLowerCase() === "p") {
    code = mover.white ? promotion.toUpperCase() : promotion.toLowerCase();
  }
  const next = [...rest, { ...mover, code, square: to }];
  if (mover.code.toLowerCase() !== "k") {
    return next;
  }
  const fileDelta = FILES.indexOf(to[0] ?? "") - FILES.indexOf(from[0] ?? "");
  if (Math.abs(fileDelta) !== 2) {
    return next;
  }
  const rank = from[1] ?? "";
  const rookFrom = fileDelta > 0 ? `h${rank}` : `a${rank}`;
  const rookTo = fileDelta > 0 ? `f${rank}` : `d${rank}`;
  return next.map((piece) =>
    piece.square === rookFrom && piece.code.toLowerCase() === "r" ? { ...piece, square: rookTo } : piece,
  );
}

/**
 * The position after a move, for showing the next step of a replay.
 * Only the board and the side to move are updated; castling and en passant rights are not tracked.
 */
export function applyUci(fen: string, uci: string): string {
  const pieces = movePiece(readPieces(fen), uci);
  const bySquare = new Map(pieces.map((piece) => [piece.square, piece.code]));
  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = "";
    let empty = 0;
    for (const file of FILES) {
      const code = bySquare.get(`${file}${rank}`);
      if (code) {
        row += `${empty > 0 ? empty : ""}${code}`;
        empty = 0;
      } else {
        empty += 1;
      }
    }
    ranks.push(`${row}${empty > 0 ? empty : ""}`);
  }
  const next = sideToMove(fen) === "white" ? "b" : "w";
  return `${ranks.join("/")} ${next} - - 0 1`;
}

export type MoveSoundKind = "move" | "capture" | "check";

/** Which sound a move makes: check wins over capture, which wins over a quiet move. */
export function moveSoundKind(fen: string, uci: string, san = ""): MoveSoundKind {
  if (san.includes("+") || san.includes("#")) {
    return "check";
  }
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const pieces = readPieces(fen);
  if (pieces.some((piece) => piece.square === to)) {
    return "capture";
  }
  const mover = pieces.find((piece) => piece.square === from);
  const enPassant = mover?.code.toLowerCase() === "p" && from[0] !== to[0];
  return enPassant ? "capture" : "move";
}

export function squareGrid(square: string, orientation: BoardOrientation): { file: number; rank: number } | null {
  const center = squareCenter(square, orientation);
  if (!center) {
    return null;
  }
  return { file: Math.floor(center.x), rank: Math.floor(center.y) };
}

export function squareFromGrid(file: number, rank: number, orientation: BoardOrientation): string {
  if (orientation === "white") {
    return `${FILES[file] ?? "a"}${8 - rank}`;
  }
  return `${FILES[7 - file] ?? "a"}${rank + 1}`;
}

function expandRank(rank: string): string[] {
  const squares: string[] = [];
  for (const char of rank) {
    const empty = Number(char);
    if (empty > 0) {
      for (let i = 0; i < empty; i += 1) {
        squares.push("");
      }
    } else {
      squares.push(char);
    }
  }
  return squares;
}
