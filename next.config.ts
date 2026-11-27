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
      // Removed games (Sports Revealer, then Stats Ranker, Roster Reveal and
      // King of the Hill in Nov 2026): old shared links go to the homepage.
      ...["reveal", "rank", "roster", "king"].flatMap((g) => [
        { source: `/${g}`, destination: "/", permanent: false },
        { source: `/${g}/:path*`, destination: "/", permanent: false },
        { source: `/nba/${g}`, destination: "/nba", permanent: false },
        { source: `/nba/${g}/:path*`, destination: "/nba", permanent: false },
      ]),
    ];
  },
};

export default nextConfig;
