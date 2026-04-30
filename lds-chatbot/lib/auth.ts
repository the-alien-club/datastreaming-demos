import { betterAuth } from "better-auth"
import { genericOAuth } from "better-auth/plugins"
import { pool } from "@/lib/db"
import { OAUTH_PROVIDER_ID } from "@/lib/constants"
import { ensureOrgMembership } from "@/lib/platform/onboarding"

// Server-side only — must NOT use the NEXT_PUBLIC_ prefix or Next.js
// constant-folds it to the build-time placeholder.
const authentikBaseUrl = process.env.AUTHENTIK_BASE_URL!
const appSlug = process.env.AUTHENTIK_APP_SLUG || "datastreaming"
const fallbackBaseURL = process.env.BETTER_AUTH_URL!
const nextBasePath = process.env.NEXT_PUBLIC_BASE_PATH || ""

// Additional origins better-auth accepts for CSRF/origin checks. The active
// per-request baseURL is implicitly trusted; everything else (alternate demo
// hostnames pointed at the same deployment) must be listed here or
// origin-check rejects the request with a 401.
const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

// Hosts allowed to drive better-auth's per-request baseURL. Derived from the
// fallback baseURL plus trustedOrigins so a single env knob (TRUSTED_ORIGINS)
// configures both CSRF allowlist and dynamic baseURL allowlist consistently.
const allowedHosts = Array.from(
  new Set(
    [fallbackBaseURL, ...trustedOrigins]
      .map((u) => {
        try {
          return new URL(u).host
        } catch {
          return null
        }
      })
      .filter((h): h is string => Boolean(h)),
  ),
)

// `basePath` includes the Next.js basePath so that better-auth's per-request
// baseURL — and therefore the OAuth redirect_uri it constructs — carries the
// /agents prefix the app is mounted under. Without this, the redirect_uri
// would be `${origin}/api/auth/oauth2/callback/...` and ingress would 404
// (no route exists outside /agents) and Authentik would reject it (the
// registered callback URL is /agents-prefixed).
const authBasePath = `${nextBasePath}/api/auth`

export const auth = betterAuth({
  appName: "LDS Chatbot",
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: { allowedHosts, fallback: fallbackBaseURL },
  basePath: authBasePath,
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
          // No static redirectURI — better-auth derives it per request from
          // ctx.baseURL (= dynamic origin + authBasePath), so a sign-in on
          // demo.legaldataspace.eu uses that domain in redirect_uri instead
          // of the build-time fallback.
          scopes: ["openid", "email", "profile", "offline_access"],
          accessType: "offline",
          prompt: "consent",
        },
      ],
    }),
  ],
})
