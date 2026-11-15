import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  redirects() {
    return [
      // Baseball Golf moved from / to /golf, like /rank and /roster. Old links
      // (including shared ones like /?date=2026-11-10) keep working; the query
      // string carries over.
      { source: "/", destination: "/golf", permanent: false },
      { source: "/archive", destination: "/golf/archive", permanent: false },
      // The NBA games start at Basketball Golf, like baseball's.
      { source: "/nba", destination: "/nba/golf", permanent: false },
      // Sports Revealer was replaced by Roster Reveal.
      { source: "/reveal", destination: "/roster", permanent: false },
      { source: "/reveal/:path*", destination: "/roster/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
