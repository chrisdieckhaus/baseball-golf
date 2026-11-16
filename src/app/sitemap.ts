import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The public baseball pages. The NBA pages stay out while they're behind the
// NBA_ENABLED kill switch (and noindex). `?date=` rounds aren't listed: they
// point their canonical URL at the game's page.
const PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" }[] = [
  { path: "/golf", priority: 1, changeFrequency: "daily" },
  { path: "/golf/player", priority: 0.8, changeFrequency: "daily" },
  { path: "/rank", priority: 0.9, changeFrequency: "daily" },
  { path: "/roster", priority: 0.9, changeFrequency: "daily" },
  { path: "/number", priority: 0.9, changeFrequency: "daily" },
  { path: "/king", priority: 0.9, changeFrequency: "daily" },
  { path: "/golf/archive", priority: 0.5, changeFrequency: "daily" },
  { path: "/golf/player/archive", priority: 0.4, changeFrequency: "daily" },
  { path: "/rank/archive", priority: 0.5, changeFrequency: "daily" },
  { path: "/roster/archive", priority: 0.5, changeFrequency: "daily" },
  { path: "/number/archive", priority: 0.5, changeFrequency: "daily" },
  { path: "/king/archive", priority: 0.5, changeFrequency: "daily" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority, changeFrequency }) => ({ url: `${SITE_URL}${path}`, priority, changeFrequency }));
}
