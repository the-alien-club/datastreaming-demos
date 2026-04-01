import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

const appSlug = process.env.AUTHENTIK_APP_SLUG || "datastreaming";
const authentikBaseUrl =
  process.env.NEXT_PUBLIC_AUTHENTIK_BASE_URL || "http://localhost:0";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const auth = betterAuth({
  appName: "OpenAIRE Research Intelligence",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  rateLimit: {
    enabled: false,
  },
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
          redirectURI: `${baseURL}${basePath}/api/auth/oauth2/callback/authentik`,
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
