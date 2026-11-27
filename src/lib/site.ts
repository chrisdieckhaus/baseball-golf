// The site's public address and the metadata each page shares (title,
// description, canonical URL, link-preview card). No "server-only" import, so
// proxy.ts can use it too.
import type { Metadata } from "next";

/** Where the site lives. Every other production host redirects here (see proxy.ts). */
export const SITE_HOST = "dailydugout.com";
export const SITE_URL = `https://${SITE_HOST}`;
export const SITE_NAME = "Daily Dugout";

/**
 * A page's metadata: its title and description, plus the same text on its
 * link-preview card and a canonical URL. The canonical URL drops the query
 * string, so `?date=` rounds count as the game's page rather than as copies.
 *
 * `title` is the full title, e.g. "Hit the Number · Daily Dugout".
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    // absolute: the layout's "%s · Daily Dugout" template doesn't reach every page.
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: SITE_NAME, type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
  };
}
