import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import GameNav from "@/components/GameNav";
import { isNbaEnabled } from "@/lib/nba-flag";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  // Resolves relative canonical and link-preview URLs against the real domain,
  // even on preview deployments and baseball-golf.vercel.app.
  metadataBase: new URL(SITE_URL),
  title: { default: "Daily Dugout", template: "%s · Daily Dugout" },
  description: "Daily Dugout: quick daily baseball stats games. Baseball Golf, Stats Ranker and Roster Reveal.",
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <GameNav nbaEnabled={isNbaEnabled()} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
