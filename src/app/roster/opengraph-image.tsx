import { OG_SIZE, ogCard } from "@/lib/og-card";

export const alt = "Roster Reveal, a daily guess-the-team baseball game on Daily Dugout";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ title: "Roster", accent: "Reveal", pitch: "You get the year. Name the team from its lineup, one player at a time." });
}
