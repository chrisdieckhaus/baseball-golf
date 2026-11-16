import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = pageMetadata({
  title: "King of the Hill Archive: Play Past Rounds · Daily Dugout",
  description: "Play any previous daily round of King of the Hill: five head-to-head matchups on one career stat.",
  path: "/king/archive",
});

export default function Page() {
  return <ArchivePage game="king" sport="mlb" />;
}
