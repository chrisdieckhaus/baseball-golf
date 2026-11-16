import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = pageMetadata({
  title: "Stats Ranker Archive: Play Past Rounds · Daily Dugout",
  description: "Play any previous daily round of Stats Ranker: put five players in order by a career stat.",
  path: "/rank/archive",
});

export default function Page() {
  return <ArchivePage game="rank" sport="mlb" />;
}
