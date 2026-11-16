import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = pageMetadata({
  title: "Roster Reveal Archive: Play Past Rounds · Daily Dugout",
  description: "Play any previous daily round of Roster Reveal: name the MLB team from its starting lineup.",
  path: "/roster/archive",
});

export default function Page() {
  return <ArchivePage game="roster" sport="mlb" />;
}
