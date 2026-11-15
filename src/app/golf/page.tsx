import type { Metadata } from "next";
import GolfPage, { type SearchParams } from "@/views/GolfPage";

export const metadata: Metadata = {
  // The layout's title template doesn't apply to a page in the same segment.
  title: { absolute: "Baseball Golf · Daily Dugout" },
  description: "A daily baseball trivia game: name the player at each all-time career rank. Lowest score wins.",
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <GolfPage searchParams={searchParams} sport="mlb" />;
}
