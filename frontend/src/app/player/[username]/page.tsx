import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlayerDashboard } from "@/components/player-dashboard";
import { requireOnboarded } from "@/lib/onboarding";
import { playerNameFromSegment } from "@/lib/player";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";

type Props = { params: Promise<{ username: string }> };

/** Only a valid name reaches the page or its title (ING-01); anything else is a plain not-found. */
async function validName(params: Props["params"]): Promise<string> {
  const name = playerNameFromSegment((await params).username);
  if (name === null) {
    notFound();
  }
  return name;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: fill(messages.analysisFor, { name: await validName(params) }) };
}

export default async function PlayerPage({ params }: Props) {
  const name = await validName(params);
  await requireOnboarded(`/player/${encodeURIComponent(name)}`);
  return (
    <Suspense fallback={null}>
      <PlayerDashboard username={name} />
    </Suspense>
  );
}
