const PLATFORM_API_URL = process.env.PLATFORM_API_URL!

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
  const response = await fetch(`${PLATFORM_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-oauth-access-token": token,
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
      "x-oauth-access-token": token,
    },
  })
  // 404 = already gone on the platform; treat as success so the local row can still be removed.
  if (response.ok || response.status === 404) return
  const body = await response.text().catch(() => "(no body)")
  throw new Error(
    `Platform API error ${response.status} ${response.statusText} on /workflows/${id}: ${body}`
  )
}

export async function runWorkflow(
  workflowId: number,
  input: { user_prompt: string; session_id: string | null },
  token: string
): Promise<{ id: number }> {
  return platformJson<{ id: number }>(
    `/workflows/${workflowId}/run`,
    {
      method: "POST",
      body: JSON.stringify({ input }),
    },
    token
  )
}

export async function getAiModels(token: string): Promise<PublicAIModel[]> {
  return platformJson<PublicAIModel[]>("/ai-models?select=public&modelType=llm", { method: "GET" }, token)
}
