import type { Metadata } from "next";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = {
  title: "Roster Reveal archive",
  description: "Play any previous daily round of Roster Reveal.",
};

export default function Page() {
  return <ArchivePage game="roster" sport="mlb" />;
}
