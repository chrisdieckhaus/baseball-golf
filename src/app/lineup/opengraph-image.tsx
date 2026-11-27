import { OG_SIZE, ogCard } from "@/lib/og-card";

export const alt = "Lineup Card, a daily baseball stats game on Daily Dugout";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ title: "Lineup", accent: "Card", pitch: "Nine spots. Nine rules. Build the lineup with the biggest career total." });
}
