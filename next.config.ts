import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  redirects() {
    return [
      // / is the homepage (every game's result for the day). Baseball Golf
      // used to live there, so old Golf links (/?date=2026-11-10, /?seed=…)
      // still go to /golf; the query string carries over.
      { source: "/", has: [{ type: "query", key: "date" }], destination: "/golf", permanent: false },
      { source: "/", has: [{ type: "query", key: "seed" }], destination: "/golf", permanent: false },
      { source: "/archive", destination: "/golf/archive", permanent: false },
      // Sports Revealer was replaced by Roster Reveal.
      { source: "/reveal", destination: "/roster", permanent: false },
      { source: "/reveal/:path*", destination: "/roster/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
