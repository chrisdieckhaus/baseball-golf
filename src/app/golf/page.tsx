import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import GolfPage, { type SearchParams } from "@/views/GolfPage";

export const metadata: Metadata = pageMetadata({
  title: "Baseball Golf: Daily Baseball Trivia Game · Daily Dugout",
  description: "A free daily baseball trivia game. Each hole gives an all-time career rank, like 83rd in RBIs. Name the player who holds it. Three holes, lowest score wins.",
  path: "/golf",
});

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <GolfPage searchParams={searchParams} sport="mlb" />;
}
