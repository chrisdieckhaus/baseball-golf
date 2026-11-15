import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNbaEnabled } from "@/lib/nba-flag";
import type { SearchParams } from "@/views/GolfPage";
import RankPage from "@/views/RankPage";

export const metadata: Metadata = {
  title: "Stats Ranker · NBA",
  description: "A daily basketball game: put five players in order by a career stat. One shot.",
  robots: { index: false },
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  if (!isNbaEnabled()) notFound();
  return <RankPage searchParams={searchParams} sport="nba" />;
}
