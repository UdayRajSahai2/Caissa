import { NextResponse } from "next/server";
import { currentUserKey } from "@/lib/auth";
import { createChallenge } from "@/lib/bot-check-server";
import { messages } from "@/messages/en";

/** AUTH-05: a fresh proof-of-work challenge, signed for the signed-in user. */
export async function GET() {
  const user = await currentUserKey();
  if (user === null) {
    return NextResponse.json({ detail: messages.signInFirst }, { status: 401 });
  }
  return NextResponse.json(createChallenge(user), { headers: { "cache-control": "no-store" } });
}
