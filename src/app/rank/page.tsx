import type { Metadata } from "next";
import type { SearchParams } from "@/views/GolfPage";
import RankPage from "@/views/RankPage";

export const metadata: Metadata = {
  title: "Stats Ranker",
  description: "A daily baseball game: put five players in order by a career stat. One shot.",
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <RankPage searchParams={searchParams} sport="mlb" />;
}
