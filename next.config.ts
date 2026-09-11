import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `use cache` + cacheTag for curated/static reads (architecture §8).
  cacheComponents: true,
  images: {
    // CommunityDragon icons, pinned to a game-data version directory (src/lib/static/cdragon.ts).
    remotePatterns: [
      { protocol: "https", hostname: "raw.communitydragon.org", pathname: "/*/game/assets/**", search: "" },
    ],
    // A pinned URL's content never changes, so keep optimized copies for 31 days.
    minimumCacheTTL: 2_678_400,
  },
};

export default nextConfig;
