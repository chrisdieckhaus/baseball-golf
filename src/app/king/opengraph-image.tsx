import { OG_SIZE, ogCard } from "@/lib/og-card";

export const alt = "King of the Hill, a daily head-to-head baseball stats game on Daily Dugout";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ title: "King of the", accent: "Hill", pitch: "Five matchups, one career stat. The winner stays on as king." });
}
