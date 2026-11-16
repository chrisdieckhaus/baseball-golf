import { OG_SIZE, ogCard } from "@/lib/og-card";

export const alt = "Hit the Number, a daily baseball stats game on Daily Dugout";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ title: "Hit the", accent: "Number", pitch: "Three players. One career-stat target. Get as close as you can without going over." });
}
