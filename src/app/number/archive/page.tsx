import type { Metadata } from "next";
import ArchivePage from "@/views/ArchivePage";

export const metadata: Metadata = {
  title: "Hit the Number archive",
  description: "Play any previous daily round of Hit the Number.",
};

export default function Page() {
  return <ArchivePage game="number" sport="mlb" />;
}
