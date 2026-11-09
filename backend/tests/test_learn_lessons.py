"""LRN-03: every move in the Learn lessons is legal, its notation is right, and every claim holds.

The lessons live in the frontend (`frontend/src/messages/learn-en.json`). Legality and notation are
checked with python-chess on every run. Claims about who wins are checked with Stockfish when a
binary is configured; without one, those checks are skipped, not passed.
"""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import chess
import chess.engine
import pytest

from app.core.config import get_settings

LESSONS_FILE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "messages" / "learn-en.json"
ENGINE_DEPTH = 18
WIN_CP = 300
BETTER_CP = 100
BALANCED_CP = 120
DRAW_CP = 50
MATE_CP = 100_000


def _diagrams() -> Iterator[tuple[str, dict[str, Any]]]:
    data = json.loads(LESSONS_FILE.read_text(encoding="utf-8"))
    for lesson in data["lessons"]:
        for index, section in enumerate(lesson["sections"]):
            diagram = section.get("diagram")
            if diagram:
                yield f"{lesson['slug']}#{index + 1}", diagram


DIAGRAMS = list(_diagrams())


def _final_board(diagram: dict[str, Any]) -> chess.Board:
    board = chess.Board(diagram["fen"])
    for step in diagram["steps"]:
        board.push(chess.Move.from_uci(step["uci"]))
    return board


def test_the_curriculum_has_lessons_in_every_category() -> None:
    data = json.loads(LESSONS_FILE.read_text(encoding="utf-8"))
    categories = {category["id"] for category in data["categories"]}
    used = {lesson["category"] for lesson in data["lessons"]}
    slugs = [lesson["slug"] for lesson in data["lessons"]]
    assert used == categories
    assert len(slugs) == len(set(slugs))
    assert len(slugs) >= 15


@pytest.mark.parametrize(("name", "diagram"), DIAGRAMS, ids=[name for name, _ in DIAGRAMS])
def test_every_move_is_legal_and_named_correctly(name: str, diagram: dict[str, Any]) -> None:
    board = chess.Board(diagram["fen"])
    assert board.is_valid(), f"{name}: start position is not a legal position ({board.status()!r})"
    for step in diagram["steps"]:
        move = chess.Move.from_uci(step["uci"])
        assert move in board.legal_moves, f"{name}: {step['uci']} is not legal in {board.fen()}"
        assert board.san(move) == step["san"], f"{name}: {step['uci']} is {board.san(move)}, not {step['san']}"
        board.push(move)


@pytest.mark.parametrize(("name", "diagram"), DIAGRAMS, ids=[name for name, _ in DIAGRAMS])
def test_mate_and_stalemate_claims_hold(name: str, diagram: dict[str, Any]) -> None:
    board = _final_board(diagram)
    expect = diagram.get("expect")
    if expect == "checkmate":
        assert board.is_checkmate(), name
    elif expect == "stalemate":
        assert board.is_stalemate(), name
    elif expect == "not-mate":
        assert not board.is_checkmate(), name
    else:
        assert not board.is_checkmate() and not board.is_stalemate(), f"{name}: ends the game but claims {expect}"


@pytest.fixture(scope="module")
def engine() -> Iterator[chess.engine.SimpleEngine]:
    path = get_settings().stockfish_path
    if not path or not Path(path).is_file():
        pytest.skip("Stockfish is not configured; engine claims were not checked")
    process = chess.engine.SimpleEngine.popen_uci(path)
    try:
        yield process
    finally:
        process.quit()


ENGINE_CLAIMS = [(name, diagram) for name, diagram in DIAGRAMS if diagram.get("expect") not in {None, "checkmate", "stalemate", "not-mate"}]


@pytest.mark.parametrize(("name", "diagram"), ENGINE_CLAIMS, ids=[name for name, _ in ENGINE_CLAIMS])
def test_engine_agrees_with_the_lesson(name: str, diagram: dict[str, Any], engine: chess.engine.SimpleEngine) -> None:
    board = _final_board(diagram)
    expect = diagram["expect"]
    if expect == "draw" and (board.is_insufficient_material() or board.is_stalemate()):
        return
    info = engine.analyse(board, chess.engine.Limit(depth=ENGINE_DEPTH))
    white = info["score"].white().score(mate_score=MATE_CP)
    assert white is not None
    if expect == "white-wins":
        assert white >= WIN_CP, f"{name}: engine says {white}"
    elif expect == "white-better":
        assert white >= BETTER_CP, f"{name}: engine says {white}"
    elif expect == "balanced":
        assert abs(white) <= BALANCED_CP, f"{name}: engine says {white}"
    elif expect == "draw":
        assert abs(white) <= DRAW_CP, f"{name}: engine says {white}"
    else:
        pytest.fail(f"{name}: unknown expectation {expect!r}")
