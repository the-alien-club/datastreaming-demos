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

const PLATFORM_API_URL = (process.env.PLATFORM_API_URL ?? "").replace(/\/$/, "")
const ADMIN_TOKEN = process.env.ADMIN_TOKEN
const ORG_ID = process.env.ORG_ID

interface PlatformUser {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  currentOrganizationId: number | null
  roles?: { slug: string; organizationId?: number | null }[]
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
    headers: { "Content-Type": "application/json", "connection": "close", ...authHeader(token) },
  })

  if (!res.ok) throw new Error(`Platform GET ${path} → ${res.status}`)

  const json = (await res.json()) as { data: T }

  return json.data
}

async function platformPost<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${PLATFORM_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "connection": "close", ...authHeader(token) },
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
 * Return the user's role slug for the configured org (e.g. "org-client",
 * "org-owner"), or null when no ORG_ID is set, the platform is unreachable,
 * or the user has no role assignment for that org.
 *
 * Never throws — callers should default to full-access when null is returned.
 */
export async function getUserOrgRole(userId: string): Promise<string | null> {
  if (!ADMIN_TOKEN || !ORG_ID) return null
  try {
    const userToken = await resolveAccessToken(userId)
    const me = await getMe(userToken)
    const orgId = Number(ORG_ID)
    const match = me.roles?.find((r) => r.organizationId === orgId)
    return match?.slug ?? null
  } catch {
    return null
  }
}

/**
 * Ensure the user is provisioned in the chatbot's org and has it selected
 * as their current organization.
 *
 * No-op if ADMIN_TOKEN or ORG_ID are not configured.
 * Errors are caught and logged — never thrown — so a platform outage does
 * not block sign-in or page loads.
 *
 * The provisioning step (member-list + create) is isolated in its own
 * try/catch so a failure there — e.g. admin token lacking list scope, or
 * the user was added manually as org-client — does NOT prevent the org
 * switch.  The switch is what sets `currentOrganizationId` on the platform
 * user record and is required for WorkflowPolicy.execute to pass.
 */
export async function ensureOrgMembership(userId: string): Promise<void> {
  if (!ADMIN_TOKEN || !ORG_ID) return

  try {
    const userToken = await resolveAccessToken(userId)
    const me = await getMe(userToken)

    // Best-effort: provision the user if they are not yet in the org.
    // Isolated so a failure here never blocks the org-switch below.
    try {
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
    } catch (provisionErr) {
      // Non-fatal: user may have been added manually as org-client, or the
      // admin token may lack list-users scope.  Continue to the switch below.
      console.error("[onboarding] member check/provision failed:", provisionErr)
    }

    // Always switch to the chatbot org when the user's current org differs.
    // This is what makes WorkflowPolicy.execute pass for org-client users.
    console.debug("[onboarding] ensuring org membership and switch for user", {
      userId,
      email: me.email,
      currentOrg: me.currentOrganizationId,
      targetOrg: ORG_ID,
    })
    if (me.currentOrganizationId !== Number(ORG_ID)) {
      await switchUserOrg(ORG_ID, userToken)
    }
  } catch (err) {
    console.error("[onboarding] ensureOrgMembership failed:", err)
  }
}
