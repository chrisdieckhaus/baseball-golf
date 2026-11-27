import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = pageMetadata({
  title: "Lineup Card Archive: Play Past Rounds · Daily Dugout",
  description: "Play any previous daily round of Lineup Card: nine spots, nine rules, the biggest career total wins.",
  path: "/lineup/archive",
});

export default function Page() {
  return <ArchivePage game="lineup" sport="mlb" />;
}
