// Org onboarding helpers — all operations are idempotent.
//
// ADMIN_TOKEN is a platform API secret (starts with oat_) issued to an
// org-admin user. It uses Authorization: Bearer (api guard) rather than
// x-oauth-access-token (oauth guard). platformFetch handles this automatically
// for calls that go through client.ts, but this module issues its own fetches
// so it duplicates the auth-header routing logic inline.
//
// ORG_ID is the numeric enterprise org ID chatbot users should belong to.
// Both env vars must be set for onboarding to run; if either is absent the
// functions short-circuit so the chatbot can be run in standalone mode.

import { resolveAccessToken } from "@/lib/auth-helpers"
import { PLATFORM_OAUTH_TOKEN_HEADER } from "@/lib/constants"

const PLATFORM_API_URL = process.env.PLATFORM_API_URL!
const ADMIN_TOKEN = process.env.ADMIN_TOKEN
const ORG_ID = process.env.ORG_ID

interface PlatformUser {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  currentOrganizationId: number | null
}

interface ManagedUserSummary {
  id: number
  email: string
}

function authHeader(token: string): Record<string, string> {
  return token.startsWith("oat_")
    ? { authorization: `Bearer ${token}` }
    : { [PLATFORM_OAUTH_TOKEN_HEADER]: token }
}

async function platformGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${PLATFORM_API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeader(token) },
  })

  if (!res.ok) throw new Error(`Platform GET ${path} → ${res.status}`)

  const json = (await res.json()) as { data: T }

  return json.data
}

async function platformPost<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${PLATFORM_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)")
    throw new Error(`Platform POST ${path} → ${res.status}: ${detail}`)
  }

  const json = (await res.json()) as { data: T }

  return json.data
}

export async function getMe(userToken: string): Promise<PlatformUser> {
  return platformGet<PlatformUser>("/users/me", userToken)
}

async function listOrgUsers(orgId: string, adminToken: string): Promise<ManagedUserSummary[]> {
  return platformGet<ManagedUserSummary[]>(`/organizations/${orgId}/users`, adminToken)
}

async function provisionUserInOrg(
  orgId: string,
  adminToken: string,
  email: string,
  firstName: string,
  lastName: string,
): Promise<void> {
  await platformPost(
    `/organizations/${orgId}/users`,
    { userType: "human", email, firstName, lastName },
    adminToken,
  )
}

async function switchUserOrg(orgId: string, userToken: string): Promise<void> {
  await platformPost(`/organizations/${orgId}/switch`, {}, userToken)
}

/**
 * Ensure the user is provisioned in the chatbot's org and has it selected
 * as their current organization.
 *
 * No-op if ADMIN_TOKEN or ORG_ID are not configured.
 * Errors are caught and logged — never thrown — so a platform outage does
 * not block sign-in or page loads.
 */
export async function ensureOrgMembership(userId: string): Promise<void> {
  if (!ADMIN_TOKEN || !ORG_ID) return

  try {
    const userToken = await resolveAccessToken(userId)

    const me = await getMe(userToken)

    const members = await listOrgUsers(ORG_ID, ADMIN_TOKEN)
    const isMember = members.some((m) => m.email === me.email)

    if (!isMember) {
      await provisionUserInOrg(
        ORG_ID,
        ADMIN_TOKEN,
        me.email,
        me.firstName ?? me.email.split("@")[0],
        me.lastName || "-",
      )
    }

    if (me.currentOrganizationId !== Number(ORG_ID)) {
      await switchUserOrg(ORG_ID, userToken)
    }
  } catch (err) {
    // Non-fatal: user still signs in; the layout guard will retry on next render
    console.error("[onboarding] ensureOrgMembership failed:", err)
  }
}
