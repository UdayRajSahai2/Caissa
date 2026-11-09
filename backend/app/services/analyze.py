from app.db.memory import MemoryGameStore
from app.db.repository import SqlGameStore
from app.engine.stockfish import Engine, evaluate_game

GameStore = SqlGameStore | MemoryGameStore


def analyze_stored_game(internal_id: str, store: GameStore, engine: Engine) -> dict:
    """ANA-01 and section 8.4. A game that already has evals is left alone."""
    try:
        if store.analysis_exists(internal_id) and store.suggestions_ready(internal_id):
            return {"game_id": internal_id, "status": "already_processed", "blunders": 0}
        stored = store.load_game(internal_id)
        if stored is None:
            raise KeyError(internal_id)
        analyzed = evaluate_game(stored.pgn, stored.player_color, engine, stored.clocks)
        blunders = store.save_analysis(internal_id, analyzed)
        return {"game_id": internal_id, "status": "success", "blunders": blunders}
    finally:
        engine.close()
