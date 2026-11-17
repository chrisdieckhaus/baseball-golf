import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import HomePage, { type HomeSearchParams } from "@/views/HomePage";

export const metadata: Metadata = pageMetadata({
  title: "Daily Dugout: Daily Baseball Stats Games",
  description:
    "Quick daily baseball stats games: Baseball Golf, Stats Ranker, Roster Reveal, Hit the Number and King of the Hill. See all of today's rounds and how you did.",
  path: "/",
});

export default function Page({ searchParams }: { searchParams: HomeSearchParams }) {
  return <HomePage searchParams={searchParams} sport="mlb" />;
}
