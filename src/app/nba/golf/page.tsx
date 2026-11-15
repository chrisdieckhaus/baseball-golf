import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNbaEnabled } from "@/lib/nba-flag";
import GolfPage, { type SearchParams } from "@/views/GolfPage";

export const metadata: Metadata = {
  title: { absolute: "Basketball Golf · Daily Dugout" },
  description: "A daily basketball trivia game: name the player at each all-time career rank. Lowest score wins.",
  robots: { index: false },
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  if (!isNbaEnabled()) notFound();
  return <GolfPage searchParams={searchParams} sport="nba" />;
}
