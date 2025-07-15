import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: async () => {
    return [
      {
        source: "/",
        destination: "https://docs.onkernel.com/mcp",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
