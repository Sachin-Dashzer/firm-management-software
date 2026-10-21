import { NextResponse } from "next/server";

/**
 * Keeps signed-out visitors out of the app. The real permission checks happen
 * in each server action (lib/permissions.js); this only decides whether a
 * session cookie is present, which is all middleware can do cheaply at the
 * edge without a database round trip.
 *
 * The 30-minute idle timeout is enforced by the session itself (auth.js): once
 * the JWT passes its maxAge the cookie no longer verifies and this redirects.
 *
 * **It does not decide whether a cookie is staff or client** (P2-9a). Reading
 * that would mean verifying the JWT here, which drags the auth config — and
 * Mongoose with it — into the edge runtime. The two layouts do it instead,
 * against the database, on every request: `(app)` turns away anybody
 * `currentUser()` will not vouch for, `(client)` anybody
 * `currentClientUser()` will not. All middleware does is send a signed-out
 * visitor to the right front door.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(request) {
  const signedIn = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (signedIn) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const portal = pathname.startsWith("/client");
  const url = new URL(portal ? "/client/login" : "/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  /*
   * Everything except the login pages, the auth endpoints, static assets —
   * and `/upload/<token>`, the client document-request page (spec section 6),
   * which is reached by people who have no account and never will.
   *
   * That page is public on purpose, so its own guard is the token: the
   * actions behind it accept a long random token, check it against a stored
   * hash, and will only ever write one file against one requested item.
   * Nothing under /upload can read a document, list anything, or reach the
   * rest of the app.
   *
   * `client/login` is excluded the same way `login` is — it is a front door,
   * so requiring a session to reach it would be a redirect loop.
   */
  matcher: [
    "/((?!login|client/login|upload/|api/auth|_next/static|_next/image|favicon.ico|.*\.png$).*)",
  ],
};
