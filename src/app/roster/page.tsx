import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import type { SearchParams } from "@/views/GolfPage";
import RosterPage from "@/views/RosterPage";

export const metadata: Metadata = pageMetadata({
  title: "Roster Reveal: Guess the MLB Team · Daily Dugout",
  description: "A free daily baseball game: you get the year, and the starting lineup is revealed one player at a time, most obscure first. Name the team in as few players as you can.",
  path: "/roster",
});

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <RosterPage searchParams={searchParams} sport="mlb" />;
}
