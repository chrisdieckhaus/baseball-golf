import type { Metadata } from "next";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = {
  title: "Baseball Golf: Player archive",
  description: "Play any previous daily round of Baseball Golf's Player mode.",
};

export default function Page() {
  return <ArchivePage game="player" sport="mlb" />;
}
