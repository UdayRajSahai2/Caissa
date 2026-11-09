export type GameCard = {
  id: string;
  result: string;
  player_color: string;
  opponent: string;
  time_class: string;
  played_at: string | null;
  final_fen: string;
  analyzed: boolean;
};

export type GamePagePayload = {
  page: number;
  page_size: number;
  total: number;
  games: GameCard[];
};

export function readGamePage(value: unknown): GamePagePayload | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (typeof body.page !== "number" || typeof body.page_size !== "number" || typeof body.total !== "number") {
    return null;
  }
  if (!Array.isArray(body.games) || !body.games.every(isGameCard)) {
    return null;
  }
  return {
    page: body.page,
    page_size: body.page_size,
    total: body.total,
    games: body.games,
  };
}

function isGameCard(value: unknown): value is GameCard {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const card = value as Record<string, unknown>;
  return (
    typeof card.id === "string" &&
    typeof card.result === "string" &&
    typeof card.player_color === "string" &&
    typeof card.opponent === "string" &&
    typeof card.time_class === "string" &&
    (card.played_at === null || typeof card.played_at === "string") &&
    typeof card.final_fen === "string" &&
    typeof card.analyzed === "boolean"
  );
}
