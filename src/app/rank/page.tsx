import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import type { SearchParams } from "@/views/GolfPage";
import RankPage from "@/views/RankPage";

export const metadata: Metadata = pageMetadata({
  title: "Stats Ranker: Daily Baseball Stats Game · Daily Dugout",
  description: "A free daily baseball game: put five MLB players in order by a career stat, from the all-time leaderboard. One shot, lowest score wins.",
  path: "/rank",
});

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <RankPage searchParams={searchParams} sport="mlb" />;
}
