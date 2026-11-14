import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import GameNav from "@/components/GameNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baseball Golf",
  description: "A daily baseball trivia game: name the player at each all-time career rank. Lowest score wins.",
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
