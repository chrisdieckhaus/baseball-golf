import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import type { SearchParams } from "@/views/GolfPage";
import NumberPage from "@/views/NumberPage";

export const metadata: Metadata = pageMetadata({
  title: "Hit the Number: Daily Baseball Stats Game · Daily Dugout",
  description:
    "A free daily baseball game: name three MLB players whose career totals add up as close to the target as you can without going over.",
  path: "/number",
});

/** Hit the Number (/number). The NBA version is /nba/number. */
export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <NumberPage searchParams={searchParams} sport="mlb" />;
}
