import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `use cache` + cacheTag for curated/static reads (architecture §8).
  cacheComponents: true,
};

export default nextConfig;
