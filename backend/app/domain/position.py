import chess


def final_fen(moves: list[tuple[int, str, str]]) -> str:
    """Last position on the board. Each move is ply, fen before the move, and UCI."""
    if not moves:
        return chess.STARTING_FEN
    _ply, fen_before, uci = max(moves, key=lambda item: item[0])
    board = chess.Board(fen_before)
    board.push_uci(uci)
    return board.fen()


def opponent_name(metadata: dict, player_color: str) -> str:
    key = "black" if player_color == "white" else "white"
    side = metadata.get(key)
    if isinstance(side, dict):
        name = side.get("username")
        if isinstance(name, str) and name.strip():
            return name.strip()
    return "Opponent"
