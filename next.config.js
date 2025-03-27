const { withContentlayer } = require("next-contentlayer2");

import("./env.mjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "randomuser.me",
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@radix-ui/react-use-callback-ref': require.resolve('@radix-ui/react-use-callback-ref'),
      '@radix-ui/primitive': require.resolve('@radix-ui/primitive'),
    };
    return config;
  },
};

module.exports = withContentlayer(nextConfig);
