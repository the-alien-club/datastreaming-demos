import type { NextConfig } from "next"
import path from "node:path"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root so the standalone output isn't nested when a lockfile
  // exists in a parent directory (e.g. monorepo checkout).
  turbopack: { root: path.resolve(".") },
  ...(basePath ? { basePath } : {}),
  async redirects() {
    // Redirect the basePath root to the default locale agents page.
    // Without this, the [locale]/page.tsx redirect loops on itself.
    return [{ source: "/", destination: "/fr/agents", permanent: false }]
  },
}

export default withNextIntl(nextConfig)
