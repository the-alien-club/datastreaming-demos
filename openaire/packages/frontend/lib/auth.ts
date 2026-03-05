import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

const appSlug = process.env.AUTHENTIK_APP_SLUG || "mcp-service";
const authentikBaseUrl =
  process.env.NEXT_PUBLIC_AUTHENTIK_BASE_URL || "https://auth.alien.club";
const auth = betterAuth({
  appName: "OpenAIRE Research Intelligence",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 24 * 60 * 60,
      strategy: "jwt",
      refreshCache: true,
    },
  },
  account: {
    storeStateStrategy: "cookie",
    storeAccountCookie: true,
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "authentik",
          clientId: process.env.AUTHENTIK_CLIENT_ID!,
          clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
          discoveryUrl: `${authentikBaseUrl}/application/o/${appSlug}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile", "offline_access"],
          accessType: "offline",
          prompt: "consent",
        },
      ],
    }),
  ],
});

export default auth;
export type Auth = typeof auth;
