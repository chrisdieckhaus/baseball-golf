import { OG_SIZE, ogCard } from "@/lib/og-card";

export const alt = "Baseball Golf, a daily baseball trivia game on Daily Dugout";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ title: "Baseball", accent: "Golf", pitch: "Name the player at each all-time career rank. Three holes, lowest score wins." });
}
