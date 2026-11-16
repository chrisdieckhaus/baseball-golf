import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = pageMetadata({
  title: "Baseball Golf Player Mode Archive · Daily Dugout",
  description: "Play any previous daily round of Baseball Golf's Player mode: name a player's all-time career rank.",
  path: "/golf/player/archive",
});

export default function Page() {
  return <ArchivePage game="player" sport="mlb" />;
}
