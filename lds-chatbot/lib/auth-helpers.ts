import { getStoredOAuthToken } from "@/lib/db"

export function resolveAccessToken(userId: string): string {
  const token = getStoredOAuthToken(userId)
  if (!token) throw new Error("No Authentik OAuth token found — please sign in via Authentik")
  return token
}
