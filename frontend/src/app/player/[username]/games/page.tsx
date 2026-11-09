import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayerGames } from "@/components/player-games";
import { requireOnboarded } from "@/lib/onboarding";
import { playerNameFromSegment } from "@/lib/player";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";

type Props = { params: Promise<{ username: string }> };

async function validName(params: Props["params"]): Promise<string> {
  const name = playerNameFromSegment((await params).username);
  if (name === null) {
    notFound();
  }
  return name;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: fill(messages.gamesTitle, { name: await validName(params) }) };
}

export default async function PlayerGamesPage({ params }: Props) {
  const name = await validName(params);
  await requireOnboarded(`/player/${encodeURIComponent(name)}/games`);
  return <PlayerGames username={name} />;
}
