import type { Metadata } from "next";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = {
  title: "Baseball Golf archive",
  description: "Play any previous daily round of Baseball Golf.",
};

export default function Page() {
  return <ArchivePage game="golf" sport="mlb" />;
}
