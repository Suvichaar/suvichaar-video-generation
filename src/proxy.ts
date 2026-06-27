import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "ltx_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = Boolean(request.cookies.get(COOKIE_NAME)?.value);

  // The login API must always be reachable.
  if (pathname === "/api/login") {
    return NextResponse.next();
  }

  // Protect API routes with a JSON 401 instead of a redirect.
  if (pathname.startsWith("/api/")) {
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Page routes: redirect based on auth state.
  if (!authed && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (authed && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
