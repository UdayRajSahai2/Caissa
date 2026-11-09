import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { contentSecurityPolicy, newNonce } from "@/lib/security-headers";

/** AUTH-01: analysis pages and the account page need a signed-in user; Learn and the landing page do not. */
const PROTECTED = /^\/(?:player(?:\/|$)|account(?:\/|$)|progress(?:\/|$)|welcome(?:\/|$))/;

/**
 * Every page gets a fresh CSP nonce. Next.js reads it from the request's CSP header and puts it on its
 * own scripts; the root layout reads x-nonce for the theme script. Protected pages also need a session.
 */
export async function middleware(request: NextRequest) {
  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production");

  if (PROTECTED.test(request.nextUrl.pathname)) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const signIn = new URL("/signin", request.nextUrl.origin);
      signIn.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      const redirect = NextResponse.redirect(signIn);
      redirect.headers.set("Content-Security-Policy", csp);
      return redirect;
    }
  }

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Pages only: API routes, static files, and the image optimizer do not render HTML.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.png|.*\\.(?:png|jpg|svg|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
