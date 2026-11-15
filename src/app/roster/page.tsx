import type { Metadata } from "next";
import type { SearchParams } from "@/views/GolfPage";
import RosterPage from "@/views/RosterPage";

export const metadata: Metadata = {
  title: "Roster Reveal",
  description: "A daily baseball game: you get the year, name the team from its starting lineup, revealed one player at a time.",
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <RosterPage searchParams={searchParams} sport="mlb" />;
}
