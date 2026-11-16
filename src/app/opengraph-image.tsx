import { OG_SIZE, ogCard } from "@/lib/og-card";

export const alt = "Daily Dugout: quick daily baseball stats games";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ title: "Daily Dugout", pitch: "Quick daily baseball stats games. New rounds every day at midnight ET." });
}
