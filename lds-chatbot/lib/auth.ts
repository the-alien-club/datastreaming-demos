import { betterAuth } from "better-auth"
import { genericOAuth } from "better-auth/plugins"
import { pool } from "@/lib/db"
import { OAUTH_PROVIDER_ID } from "@/lib/constants"
import { ensureOrgMembership } from "@/lib/platform/onboarding"

// Server-side only — must NOT use the NEXT_PUBLIC_ prefix or Next.js
// constant-folds it to the build-time placeholder.
const authentikBaseUrl = process.env.AUTHENTIK_BASE_URL!
const appSlug = process.env.AUTHENTIK_APP_SLUG || "datastreaming"
const baseURL = process.env.BETTER_AUTH_URL!
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""

// Additional origins better-auth accepts for CSRF/origin checks. baseURL is
// implicitly trusted; everything else (e.g. alternate demo hostnames pointed
// at the same deployment) must be listed here or origin-check rejects the
// request with a 401. Comma-separated for ergonomic ConfigMap wiring.
const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

export const auth = betterAuth({
  appName: "LDS Chatbot",
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL,
  trustedOrigins,
  database: pool,
  // The default rate limiter trips on sign-in's burst of internal calls.
  rateLimit: { enabled: false },
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
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          // Run org onboarding once per session creation.
          // Errors are swallowed inside ensureOrgMembership.
          await ensureOrgMembership(session.userId)
        },
      },
    },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: OAUTH_PROVIDER_ID,
          clientId: process.env.AUTHENTIK_CLIENT_ID!,
          clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
          discoveryUrl: `${authentikBaseUrl}/application/o/${appSlug}/.well-known/openid-configuration`,
          redirectURI: `${baseURL}${basePath}/api/auth/oauth2/callback/${OAUTH_PROVIDER_ID}`,
          scopes: ["openid", "email", "profile", "offline_access"],
          accessType: "offline",
          prompt: "consent",
        },
      ],
    }),
  ],
})
