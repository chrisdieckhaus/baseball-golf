import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNbaEnabled } from "@/lib/nba-flag";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = {
  title: "Hit the Number (NBA) archive",
  description: "Play any previous daily round of NBA Hit the Number.",
  robots: { index: false },
};

export default function Page() {
  if (!isNbaEnabled()) notFound();
  return <ArchivePage game="number" sport="nba" />;
}
