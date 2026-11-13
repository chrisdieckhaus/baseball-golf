import "server-only";
import { cookies } from "next/headers";
import { isValidPlayerId } from "./plays";

const COOKIE = "bg_player";
const TWO_YEARS = 60 * 60 * 24 * 365 * 2;

/** The anonymous player ID for this browser, or null if it hasn't played yet. */
export async function readPlayerId(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return isValidPlayerId(value) ? value : null;
}

/** Get this browser's player ID, creating one (and setting the cookie) if needed. Route handlers only. */
export async function ensurePlayerId(): Promise<string> {
  const existing = await readPlayerId();
  const id = existing ?? crypto.randomUUID();
  // Re-set on every write so the two-year expiry rolls forward for active players.
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TWO_YEARS,
  });
  return id;
}
