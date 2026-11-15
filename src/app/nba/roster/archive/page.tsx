import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNbaEnabled } from "@/lib/nba-flag";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = {
  title: "Roster Reveal · NBA archive",
  description: "Play any previous daily round of the NBA Roster Reveal.",
  robots: { index: false },
};

export default function Page() {
  if (!isNbaEnabled()) notFound();
  return <ArchivePage game="roster" sport="nba" />;
}
