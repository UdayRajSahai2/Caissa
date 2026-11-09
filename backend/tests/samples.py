PGN = """[White "Hikaru"]
[Black "Opp"]
[Result "1-0"]

1. e4 {[%clk 0:00:20]} e5 {[%clk 0:09:40]}
"""


def raw_game(game_id: str, time_class: str = "rapid", end_time: int = 1_700_000_000) -> dict:
    return {
        "uuid": game_id,
        "pgn": PGN,
        "time_class": time_class,
        "time_control": "600",
        "end_time": end_time,
        "white": {"username": "Hikaru", "result": "win"},
        "black": {"username": "Opp", "result": "checkmated"},
        "url": f"https://www.chess.com/game/live/{game_id}",
    }
