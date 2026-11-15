import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import GameNav from "@/components/GameNav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Daily Dugout", template: "%s · Daily Dugout" },
  description: "Daily Dugout: quick daily sports stats games. Baseball Golf, Stats Ranker and Roster Reveal.",
  applicationName: "Daily Dugout",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <GameNav />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
