import type { NextConfig } from "next"
import path from "node:path"

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root so the standalone output isn't nested when a lockfile
  // exists in a parent directory (e.g. monorepo checkout).
  turbopack: { root: path.resolve(".") },
  ...(basePath ? { basePath } : {}),
}

export default nextConfig
