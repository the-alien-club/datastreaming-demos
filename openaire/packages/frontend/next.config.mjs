/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Only use basePath in production, not in local dev
  ...(process.env.NODE_ENV === 'production' && {
    basePath: '/openaire',
    assetPrefix: '/openaire',
  }),
};

export default nextConfig;
