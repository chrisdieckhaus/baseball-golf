import type { Metadata } from "next";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = {
  title: "Stats Ranker archive",
  description: "Play any previous daily round of Stats Ranker.",
};

export default function Page() {
  return <ArchivePage game="rank" sport="mlb" />;
}
