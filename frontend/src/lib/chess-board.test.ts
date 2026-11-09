import { describe, expect, it } from "vitest";
import { applyUci, movePiece, moveSoundKind, ownsSquare, readPieces } from "@/lib/chess-board";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("movePiece", () => {
  it("slides a pawn and keeps the other pieces", () => {
    const moved = movePiece(readPieces(START), "e2e4");
    expect(moved.find((piece) => piece.id === "e2")?.square).toBe("e4");
    expect(moved.some((piece) => piece.square === "e2")).toBe(false);
    expect(moved).toHaveLength(32);
  });

  it("removes the captured piece", () => {
    const pieces = readPieces("8/8/8/3p4/4P3/8/8/8 w - - 0 1");
    const moved = movePiece(pieces, "e4d5");
    expect(moved.map((piece) => piece.square).sort()).toEqual(["d5"]);
    expect(moved[0]?.code).toBe("P");
  });

  it("takes an en passant pawn", () => {
    const pieces = readPieces("8/8/8/3pP3/8/8/8/8 w - d6 0 1");
    const moved = movePiece(pieces, "e5d6");
    expect(moved.map((piece) => `${piece.code}${piece.square}`)).toEqual(["Pd6"]);
  });

  it("promotes a pawn", () => {
    const moved = movePiece(readPieces("8/P7/8/8/8/8/8/8 w - - 0 1"), "a7a8q");
    expect(moved[0]).toMatchObject({ square: "a8", code: "Q" });
  });

  it("moves the rook when the king castles", () => {
    const moved = movePiece(readPieces("8/8/8/8/8/8/8/4K2R w K - 0 1"), "e1g1");
    const squares = Object.fromEntries(moved.map((piece) => [piece.id, piece.square]));
    expect(squares).toEqual({ e1: "g1", h1: "f1" });
  });

  it("only lets the side to move pick up a piece", () => {
    expect(ownsSquare(START, "e2")).toBe(true);
    expect(ownsSquare(START, "e7")).toBe(false);
    expect(ownsSquare(START, "e4")).toBe(false);
  });
});

describe("replay helpers", () => {
  it("plays a move and hands the turn to the other side", () => {
    expect(applyUci(START, "e2e4")).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b - - 0 1");
  });

  it("moves the rook when the king castles", () => {
    const ready = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    expect(applyUci(ready, "e1g1").split(" ")[0]).toBe("r3k2r/8/8/8/8/8/8/R4RK1");
  });

  it("names the sound: check beats capture beats a quiet move", () => {
    const capture = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2";
    expect(moveSoundKind(START, "e2e4", "e4")).toBe("move");
    expect(moveSoundKind(capture, "e4d5", "exd5")).toBe("capture");
    expect(moveSoundKind(capture, "f1b5", "Bb5+")).toBe("check");
    const passant = "8/8/8/3pP3/8/8/8/4K2k w - d6 0 1";
    expect(moveSoundKind(passant, "e5d6")).toBe("capture");
  });
});
