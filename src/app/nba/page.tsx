import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNbaEnabled } from "@/lib/nba-flag";
import HomePage, { type HomeSearchParams } from "@/views/HomePage";

export const metadata: Metadata = {
  title: { absolute: "Daily Dugout: NBA" },
  description: "Every daily basketball game, and how you did.",
  robots: { index: false },
};

export default function Page({ searchParams }: { searchParams: HomeSearchParams }) {
  if (!isNbaEnabled()) notFound();
  return <HomePage searchParams={searchParams} sport="nba" />;
}
