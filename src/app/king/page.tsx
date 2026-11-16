import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import type { SearchParams } from "@/views/GolfPage";
import KothPage from "@/views/KothPage";

export const metadata: Metadata = pageMetadata({
  title: "King of the Hill: Daily Baseball Stats Showdown · Daily Dugout",
  description:
    "A free daily baseball game: five head-to-head matchups on one career stat. Tap the better player; the winner stays on as king against a new challenger.",
  path: "/king",
});

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <KothPage searchParams={searchParams} sport="mlb" />;
}
