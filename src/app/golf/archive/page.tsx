import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = pageMetadata({
  title: "Baseball Golf Archive: Play Past Rounds · Daily Dugout",
  description: "Play any previous daily round of Baseball Golf, the baseball trivia game where you name the player at an all-time career rank.",
  path: "/golf/archive",
});

export default function Page() {
  return <ArchivePage game="golf" sport="mlb" />;
}
