import { NextResponse } from "next/server";

/**
 * Keeps signed-out visitors out of the app. The real permission checks happen
 * in each server action (lib/permissions.js); this only decides whether a
 * session cookie is present, which is all middleware can do cheaply at the
 * edge without a database round trip.
 *
 * The 30-minute idle timeout is enforced by the session itself (auth.js): once
 * the JWT passes its maxAge the cookie no longer verifies and this redirects.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(request) {
  const signedIn = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (signedIn) return NextResponse.next();

  const url = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // everything except the login pages, the auth endpoints and static assets
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\.png$).*)",
  ],
};
