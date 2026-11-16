import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = pageMetadata({
  title: "Hit the Number Archive: Play Past Rounds · Daily Dugout",
  description: "Play any previous daily round of Hit the Number: three MLB players, one career-stat target, don't go over.",
  path: "/number/archive",
});

export default function Page() {
  return <ArchivePage game="number" sport="mlb" />;
}
