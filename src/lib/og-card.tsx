// The link-preview card (1200×630) shown when a Daily Dugout link is pasted
// into a chat or a post. Each game's opengraph-image.tsx renders one with its
// own name and pitch. Spoiler-free: never today's stat, rank or team.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

// The diamond logo from the favicon. It doesn't change, so read it once.
const logo = `data:image/svg+xml;base64,${await readFile(join(process.cwd(), "src/app/icon.svg"), "base64")}`;

export function ogCard({ title, accent, pitch }: { title: string; accent?: string; pitch: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "linear-gradient(180deg, #1f5e3b, #17402a)",
          color: "#f8f5ec",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 40, color: "#b9cbbd" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse needs a plain <img> */}
          <img src={logo} width={88} height={88} alt="" />
          Daily Dugout
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 112, fontWeight: 700, lineHeight: 1 }}>
            {title}
            {accent ? <span style={{ color: "#f2b8a8", marginLeft: 28 }}>{accent}</span> : null}
          </div>
          <div style={{ display: "flex", fontSize: 44, lineHeight: 1.3, color: "#f8f5ec", maxWidth: 1000 }}>{pitch}</div>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#b9cbbd" }}>A free daily baseball game · dailydugout.com</div>
      </div>
    ),
    OG_SIZE,
  );
}
