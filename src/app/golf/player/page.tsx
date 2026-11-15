import type { Metadata } from "next";
import type { SearchParams } from "@/views/GolfPage";
import PlayerGolfPage from "@/views/PlayerGolfPage";

export const metadata: Metadata = {
  title: { absolute: "Baseball Golf: Player · Daily Dugout" },
  description: "A daily baseball trivia game: we name the player, you name his all-time career rank. Lowest score wins.",
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <PlayerGolfPage searchParams={searchParams} sport="mlb" />;
}
