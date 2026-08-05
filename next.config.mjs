/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: [
    "@cline/sdk",
    "@cline/core",
    "@cline/llms",
    "@cline/shared",
  ],
};

export default nextConfig;
