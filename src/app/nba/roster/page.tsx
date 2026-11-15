import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNbaEnabled } from "@/lib/nba-flag";
import type { SearchParams } from "@/views/GolfPage";
import RosterPage from "@/views/RosterPage";

export const metadata: Metadata = {
  title: "Roster Reveal · NBA",
  description: "A daily basketball game: you get the season, name the team from its lineup, revealed one player at a time.",
  robots: { index: false },
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  if (!isNbaEnabled()) notFound();
  return <RosterPage searchParams={searchParams} sport="nba" />;
}
