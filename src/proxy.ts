// Sends production traffic on any other host (baseball-golf.vercel.app) to
// dailydugout.com, so search engines and shared links see one site.
//
// Saved plays are keyed by the anonymous bg_player cookie, and cookies don't
// cross domains. So the redirect carries the ID along once (?carry=…), and
// dailydugout.com sets it as the cookie, unless that browser already has one
// there, and drops it from the address bar with a second redirect.
import { NextResponse, type NextRequest } from "next/server";
import { isValidPlayerId } from "@/lib/plays";
import { SITE_HOST, SITE_URL } from "@/lib/site";

const COOKIE = "bg_player"; // src/lib/player-cookie.ts (server-only, so not imported here)
const CARRY = "carry";
const TWO_YEARS = 60 * 60 * 24 * 365 * 2;

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const host = request.headers.get("host")?.split(":")[0];

  // Production only: previews and local dev keep their own hosts.
  if (process.env.VERCEL_ENV === "production" && host && host !== SITE_HOST) {
    const target = new URL(`${url.pathname}${url.search}`, SITE_URL);
    const id = request.cookies.get(COOKIE)?.value;
    if (isValidPlayerId(id)) target.searchParams.set(CARRY, id);
    return NextResponse.redirect(target, 308);
  }

  const carried = url.searchParams.get(CARRY);
  if (carried !== null) {
    const clean = url.clone();
    clean.searchParams.delete(CARRY);
    const response = NextResponse.redirect(clean, 307);
    if (isValidPlayerId(carried) && !request.cookies.has(COOKIE)) {
      response.cookies.set(COOKIE, carried, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: TWO_YEARS,
      });
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Pages only. API calls from tabs already open on the old host keep working
  // there; static files and Next's own assets don't need the redirect.
  matcher: ["/((?!api/|_next/|.*\\.[a-z0-9]+$).*)"],
};
