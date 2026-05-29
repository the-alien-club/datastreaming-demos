import { getStoredOAuthToken } from "@/lib/db"

export async function resolveAccessToken(userId: string): Promise<string> {
  const token = await getStoredOAuthToken(userId)
  if (!token) throw new Error("No Authentik OAuth token found — please sign in via Authentik")
  return token
}
