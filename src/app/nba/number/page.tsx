import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNbaEnabled } from "@/lib/nba-flag";
import type { SearchParams } from "@/views/GolfPage";
import NumberPage from "@/views/NumberPage";

export const metadata: Metadata = {
  title: { absolute: "Hit the Number · NBA · Daily Dugout" },
  description:
    "A daily basketball game: name three players whose career totals add up as close to the target as you can without going over.",
  robots: { index: false },
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  if (!isNbaEnabled()) notFound();
  return <NumberPage searchParams={searchParams} sport="nba" />;
}
