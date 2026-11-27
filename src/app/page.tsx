import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import HomePage, { type HomeSearchParams } from "@/views/HomePage";

export const metadata: Metadata = pageMetadata({
  title: "Daily Dugout: Daily Baseball Stats Games",
  description:
    "Quick daily baseball stats games: Baseball Golf and Hit the Number. See all of today's rounds and how you did.",
  path: "/",
});

export default function Page({ searchParams }: { searchParams: HomeSearchParams }) {
  return <HomePage searchParams={searchParams} sport="mlb" />;
}
