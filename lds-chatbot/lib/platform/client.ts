import { PLATFORM_OAUTH_TOKEN_HEADER } from "@/lib/constants"

// Strip any accidental trailing slash so path concatenation never produces
// a double-slash URL (e.g. https://api.example.com//users/me).
const PLATFORM_API_URL = (process.env.PLATFORM_API_URL ?? "").replace(/\/$/, "")

export interface PublicAIModel {
  id: number
  name: string
  slug: string
  modelType: string
  // Provider used to be returned as an expanded `{ id, slug, name }` object;
  // the platform now only returns `providerId` plus a few other flat fields,
  // and the UI should not crash when reading them.
  providerId?: number | null
  apiUrl?: string | null
  description?: string | null
  // Kept for back-compat in case the platform ever re-expands provider.
  provider?: { id: number; slug: string; name: string } | null
}

/**
 * Best-effort human-readable provider label for an AI model. Falls back to
 * the apiUrl hostname when the platform doesn't return an expanded `provider`.
 */
export function providerLabelFromModel(m: PublicAIModel): string {
  if (m.provider?.name) return m.provider.name
  const url = m.apiUrl
  if (!url) return ""
  try {
    const host = new URL(url).hostname
    if (host.endsWith("openai.com")) return "OpenAI"
    if (host.endsWith("anthropic.com")) return "Anthropic"
    if (host.includes("googleapis.com") || host.endsWith("google.com")) return "Google"
    if (host.endsWith("mistral.ai")) return "Mistral"
    return host
  } catch {
    return ""
  }
}

export interface CreateWorkflowBody {
  name: string
  slug: string
  description?: string
  isPublic: boolean
  type: string
  nodes: unknown[]
  edges: unknown[]
}

export interface WorkflowResponse {
  id: number
  name: string
  slug: string
  description?: string
  isPublic: boolean
  type: string
}

async function platformFetch(
  path: string,
  options: RequestInit,
  token: string
): Promise<Response> {
  // API tokens issued by the platform start with "oat_" and are read by the
  // backend's `api` guard via Authorization: Bearer. Authentik OAuth tokens go
  // via x-oauth-access-token (oauth guard).
  const authHeader: Record<string, string> = token.startsWith("oat_")
    ? { authorization: `Bearer ${token}` }
    : { [PLATFORM_OAUTH_TOKEN_HEADER]: token }

  const response = await fetch(`${PLATFORM_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      // Disable HTTP keep-alive so UNDICI never picks a stale pooled connection
      // for state-mutating methods (PATCH, POST, DELETE). Without this, UNDICI
      // retries on a fresh socket when the platform closes an idle connection
      // mid-flight, causing every PATCH /workflows/:id to fire twice.
      "connection": "close",
      ...authHeader,
      ...(options.headers as Record<string, string> | undefined),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)")
    throw new Error(
      `Platform API error ${response.status} ${response.statusText} on ${path}: ${body}`
    )
  }

  return response
}

async function platformJson<T>(path: string, options: RequestInit, token: string): Promise<T> {
  const response = await platformFetch(path, options, token)
  const json = await response.json() as { success?: boolean; data?: T } | T
  if (json !== null && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data
  }
  return json as T
}

export async function createWorkflow(body: CreateWorkflowBody, token: string): Promise<WorkflowResponse> {
  return platformJson<WorkflowResponse>("/workflows", {
    method: "POST",
    body: JSON.stringify(body),
  }, token)
}

export async function updateWorkflow(
  id: number,
  body: Partial<{
    name: string
    slug: string
    description: string
    nodes: unknown[]
    edges: unknown[]
    isPublic: boolean
    type: string
  }>,
  token: string
): Promise<void> {
  await platformFetch(`/workflows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }, token)
}

export async function getWorkflow(id: number, token: string): Promise<unknown> {
  return platformJson<unknown>(`/workflows/${id}`, { method: "GET" }, token)
}

export async function deleteWorkflow(id: number, token: string): Promise<void> {
  const response = await fetch(`${PLATFORM_API_URL}/workflows/${id}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "connection": "close",
      [PLATFORM_OAUTH_TOKEN_HEADER]: token,
    },
  })
  // 404 = already gone on the platform; treat as success so the local row can still be removed.
  if (response.ok || response.status === 404) return
  const body = await response.text().catch(() => "(no body)")
  throw new Error(
    `Platform API error ${response.status} ${response.statusText} on /workflows/${id}: ${body}`
  )
}

export async function getAiModels(token: string): Promise<PublicAIModel[]> {
  return platformJson<PublicAIModel[]>("/ai-models?select=public&modelType=llm", { method: "GET" }, token)
}

export interface OpenResponsesStreamBody {
  model: string
  input: string
  previous_response_id?: string
}

/**
 * Open a streaming connection to the platform's OpenAI Responses-API
 * endpoint for a given agent workflow. Returns the raw upstream
 * `Response` so the caller can pipe its SSE body through a translator.
 *
 * Throws on transport errors. Returns a non-OK Response (with a body)
 * for the caller to surface upstream HTTP failures verbatim — the
 * platform's error envelope is more useful to clients than a generic
 * 502 string would be.
 */
export async function openResponsesStream(
  workflowId: number,
  body: OpenResponsesStreamBody,
  token: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${PLATFORM_API_URL}/agent/${workflowId}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [PLATFORM_OAUTH_TOKEN_HEADER]: token,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  })
}

/**
 * Resume an in-progress (or replay a completed) Responses-API stream
 * via the platform's `GET /agent/:id/responses/:respId?starting_after=<seq>`
 * endpoint per `responses_v1.md` §5. The platform replays every event
 * with `sequence_number > startingAfter` and continues live if still in
 * progress. Returns the raw upstream `Response` so the caller can pipe
 * its SSE body through `translateResponseStream`.
 */
export async function resumeResponsesStream(
  workflowId: number,
  responseId: string,
  startingAfter: number,
  token: string,
  signal?: AbortSignal,
): Promise<Response> {
  const url = new URL(
    `${PLATFORM_API_URL}/agent/${workflowId}/responses/${encodeURIComponent(responseId)}`,
  )
  url.searchParams.set("starting_after", String(startingAfter))
  return fetch(url.toString(), {
    method: "GET",
    headers: {
      [PLATFORM_OAUTH_TOKEN_HEADER]: token,
      Accept: "text/event-stream",
    },
    signal,
  })
}
