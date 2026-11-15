import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNbaEnabled } from "@/lib/nba-flag";
import type { SearchParams } from "@/views/GolfPage";
import PlayerGolfPage from "@/views/PlayerGolfPage";

export const metadata: Metadata = {
  title: { absolute: "Basketball Golf: Player · Daily Dugout" },
  description: "A daily basketball trivia game: we name the player, you name his all-time career rank. Lowest score wins.",
  robots: { index: false },
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  if (!isNbaEnabled()) notFound();
  return <PlayerGolfPage searchParams={searchParams} sport="nba" />;
}
