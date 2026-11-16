import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import type { SearchParams } from "@/views/GolfPage";
import PlayerGolfPage from "@/views/PlayerGolfPage";

export const metadata: Metadata = pageMetadata({
  title: "Baseball Golf: Player Mode · Daily Dugout",
  description: "A free daily baseball trivia game: we name the player and a career stat, you guess where he ranks all-time. Three holes, lowest score wins.",
  path: "/golf/player",
});

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <PlayerGolfPage searchParams={searchParams} sport="mlb" />;
}
