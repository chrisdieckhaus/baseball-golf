import { OG_SIZE, ogCard } from "@/lib/og-card";

export const alt = "Baseball Golf Player mode on Daily Dugout";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ title: "Baseball", accent: "Golf", pitch: "Player mode: we name the player, you name his all-time rank. Lowest score wins." });
}
