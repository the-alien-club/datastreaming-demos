/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // NEXT_PUBLIC_BASE_PATH is baked at build time. Set in Dockerfile for prod (/openaire),
  // unset for local dev (empty string = root).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
};

export default nextConfig;
