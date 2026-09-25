import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health/public"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/health/public") ||
    pathname.match(/\.(png|jpg|svg|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith("/login"));
  const cookie = req.cookies.get(process.env.COOKIE_NAME ?? "synapse_session");
  if (!cookie && !isPublic && !pathname.startsWith("/api/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
