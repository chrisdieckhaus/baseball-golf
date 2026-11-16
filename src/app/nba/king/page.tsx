import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNbaEnabled } from "@/lib/nba-flag";
import type { SearchParams } from "@/views/GolfPage";
import KothPage from "@/views/KothPage";

export const metadata: Metadata = {
  title: "King of the Hill · NBA",
  description: "A daily basketball game: five head-to-head matchups on one career stat. The winner stays on as king.",
  robots: { index: false },
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  if (!isNbaEnabled()) notFound();
  return <KothPage searchParams={searchParams} sport="nba" />;
}
