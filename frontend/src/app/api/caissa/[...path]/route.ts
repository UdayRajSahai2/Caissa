import { NextResponse, type NextRequest } from "next/server";
import { currentUserKey } from "@/lib/auth";
import { CLEARANCE_COOKIE, hasClearance } from "@/lib/bot-check-server";
import { proxyTarget, startsWork } from "@/lib/proxy-path";
import { messages } from "@/messages/en";

/**
 * AUTH-03: the browser's only door to the API. It forwards an allowlisted path for a signed-in user,
 * adding the server-only secret and the user key. The API refuses anything that did not come through here.
 */
type Context = { params: Promise<{ path: string[] }> };

const UPSTREAM_TIMEOUT_MS = 30_000;

export async function GET(request: NextRequest, context: Context) {
  return forward(request, context, "GET");
}

export async function POST(request: NextRequest, context: Context) {
  return forward(request, context, "POST");
}

async function forward(request: NextRequest, context: Context, method: "GET" | "POST") {
  const { path } = await context.params;
  const target = proxyTarget(method, path, request.nextUrl.searchParams);
  if (target === null) {
    return NextResponse.json({ detail: messages.proxyUnknown }, { status: 404 });
  }
  // A POST starts work; it must come from a page on this site (defense in depth beside SameSite cookies).
  if (method === "POST" && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ detail: messages.proxyOtherSite }, { status: 403 });
  }
  const user = await currentUserKey();
  if (user === null) {
    return NextResponse.json({ detail: messages.signInFirst }, { status: 401 });
  }
  if (startsWork(method, target) && !hasClearance(user, request.cookies.get(CLEARANCE_COOKIE)?.value)) {
    // 428: the browser solves the bot check (api-fetch.ts) and sends the call again.
    return NextResponse.json({ detail: messages.botCheckNeeded }, { status: 428 });
  }
  const base = process.env.CAISSA_API_URL;
  const token = process.env.CAISSA_INTERNAL_TOKEN;
  if (!base || !token) {
    return NextResponse.json({ detail: messages.analyzeUnreachable }, { status: 503 });
  }
  try {
    const upstream = await fetch(`${base}/${target}`, {
      method,
      headers: { accept: "application/json", "x-caissa-internal": token, "x-caissa-user": user },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const headers = new Headers({ "cache-control": "no-store" });
    const type = upstream.headers.get("content-type");
    const retry = upstream.headers.get("retry-after");
    if (type) {
      headers.set("content-type", type);
    }
    if (retry) {
      headers.set("retry-after", retry);
    }
    const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
    return new NextResponse(body, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ detail: messages.analyzeUnreachable }, { status: 502 });
  }
}
