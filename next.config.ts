import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Sports Revealer was replaced by Roster Reveal.
  redirects() {
    return [
      { source: "/reveal", destination: "/roster", permanent: false },
      { source: "/reveal/:path*", destination: "/roster/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
