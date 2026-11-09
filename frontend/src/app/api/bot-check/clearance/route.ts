import { NextResponse, type NextRequest } from "next/server";
import { currentUserKey } from "@/lib/auth";
import { readChallenge } from "@/lib/bot-check-shared";
import { CLEARANCE_COOKIE, CLEARANCE_SECONDS, clearanceToken, verifySolution } from "@/lib/bot-check-server";
import { messages } from "@/messages/en";

/** AUTH-05: a correct answer earns an hour of clearance, in an http-only cookie bound to this user. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ detail: messages.proxyOtherSite }, { status: 403 });
  }
  const user = await currentUserKey();
  if (user === null) {
    return NextResponse.json({ detail: messages.signInFirst }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { challenge?: unknown; nonce?: unknown } | null;
  const challenge = readChallenge(body?.challenge);
  if (!challenge || !verifySolution(user, challenge, body?.nonce)) {
    return NextResponse.json({ detail: messages.botCheckFailed }, { status: 400 });
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(CLEARANCE_COOKIE, clearanceToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    maxAge: CLEARANCE_SECONDS,
  });
  return response;
}
