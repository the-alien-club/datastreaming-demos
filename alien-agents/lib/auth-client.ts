"use client"

import { createAuthClient } from "better-auth/react"
import { genericOAuthClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  basePath: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth`,
  plugins: [genericOAuthClient()],
})
