import { betterAuth } from "better-auth"
import { genericOAuth } from "better-auth/plugins"
import { pool } from "@/lib/db"

const authentikBaseUrl = process.env.NEXT_PUBLIC_AUTHENTIK_BASE_URL!
const appSlug = process.env.AUTHENTIK_APP_SLUG || "datastreaming"
const baseURL = process.env.BETTER_AUTH_URL!
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""

export const auth = betterAuth({
  appName: "LDS Chatbot",
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL,
  database: pool,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 86400,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "authentik",
          clientId: process.env.AUTHENTIK_CLIENT_ID!,
          clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
          discoveryUrl: `${authentikBaseUrl}/application/o/${appSlug}/.well-known/openid-configuration`,
          redirectURI: `${baseURL}${basePath}/api/auth/oauth2/callback/authentik`,
          scopes: ["openid", "email", "profile", "offline_access"],
          accessType: "offline",
          prompt: "consent",
        },
      ],
    }),
  ],
})
