# Publisher Demo

Single-page live demo of the Alien platform for publishers. Five panels driven
by **one real MCP Configuration** on the platform. No mock data — every value
shown in the UI is read from `/mcp-configurations`, `/datasets`, and
`/external-apis` via the admin OAT in `.env`.

## Quickstart

```bash
cp .env.example .env
# Fill in PLATFORM_API_URL, MCP_ALIEN_URL, ADMIN_OAT, DEMO_WORKFLOW_ID,
# ANTHROPIC_API_KEY, ORG_ID. DEMO_CONFIG_SLUG can stay as a placeholder — the demo
# falls back to the admin OAT user's default configuration if the env-pinned
# slug isn't found on the platform.
npm install
npm run dev
```

Visit <http://localhost:3000>.

## Platform prerequisites

The admin OAT in `ADMIN_OAT` must belong to a user whose organization has:

1. **At least one MCP Configuration** (auto-resolved if `DEMO_CONFIG_SLUG`
   doesn't exist). Visit `/mcp/configure` on the platform to create one,
   pick the clusters + datasets + connectors you want demonstrable.
2. **Clusters with datasets** that the configuration references — the
   Datasources panel populates from `/mcp-configurations/available-sources`.
3. **External-API connectors** registered if you want the External APIs
   panel to show anything. They appear here too.
4. **A workflow** for Mode A (Agentic flow) whose `mcpServer` node points at
   `${MCP_ALIEN_URL}/mcp?config=<the_slug>`. Set `DEMO_WORKFLOW_ID` to the
   numeric workflow ID. The route forwards to
   `${PLATFORM_API_URL}/agent/${DEMO_WORKFLOW_ID}/responses`.
5. **Dataset `access_price`** set to a non-zero value if you want royalty
   numbers to be non-zero. Same for `external_api_endpoints.unit_price_cents`.

The admin OAT needs read access to:
- `/mcp-configurations/*`
- `/datasets/*`
- `/external-apis/*` and `/external-apis/:id/endpoints`
- exec access to `/agent/:workflowId/responses` for Mode A

`ORG_ID` is the numeric organization id forwarded as `x-organization-id` on
every platform request. It locks the demo to a single tenant: even if the
admin OAT user belongs to multiple organisations, only `ORG_ID`'s clusters
+ external APIs surface in the picker, and Mode B's mcp-alien only exposes
that org's tools.

## What's on the page

Five panels, all driven by the live platform:

- **MCP Configuration chip** — slug + cluster/api counts pulled from the
  resolved configuration. Pulses on a successful save.
- **Datasources** — 2-level checkbox tree of every cluster the admin user's
  organization owns (from `available-sources`), with each cluster's datasets
  expandable. Toggling marks the configuration draft dirty.
- **External APIs** — connector cards from `available-sources.external_apis`.
  Sparkline animates when a tool from that connector is called.
- **Access mode** — Data flow (Claude Agent SDK + mcp-alien) vs Agentic flow
  (platform workflow). Switching mid-conversation prompts a confirm modal.
- **Live access** — counters start at 0 and tick up from real tool calls.
  Tape and attribution bars build from `data-toolCall` chunks. No seed data.
- **Agent** — empty until you type. `Send` posts to `/api/demo/chat` with the
  current mode. Mode A streams, Mode B polls a job. Tool cards collapse open
  to show real arguments and result previews.

## Backend route surface

All under `app/api/demo/`:

| Route | Method | Purpose |
|---|---|---|
| `/api/demo/config` | GET | Resolves slug (env-pinned or default), returns `{ configuration, sources, resolved_via }` |
| `/api/demo/config` | PUT | Forwards `{ config: { clusters, external_apis } }` to `PUT /mcp-configurations/:slug` |
| `/api/demo/pricing` | GET | Returns flat `{ pricing: { "dataset:<id>": eur, "<tool_name>": eur } }` map built from `Dataset.access_price` + `external_api_endpoint.unit_price_cents / 100` |
| `/api/demo/chat` | POST | `mode: "agentic"` — streams the platform Responses API via AI SDK v6 `createUIMessageStream`. `mode: "data"` — starts a Claude Agent SDK job and returns `{ jobId, configSlug }` |
| `/api/demo/status/[jobId]` | GET | Polled by Mode B every 1.5s; returns `JobProgress` snapshot |
| `/api/demo/stop/[jobId]` | POST | Cancels a Mode B job |

## Slug resolution

The platform auto-generates slugs (`cfg_<base64url>`), so `DEMO_CONFIG_SLUG`
can't be set to `cfg_publisher_demo` ahead of time. The demo handles this:

1. Try `GET /mcp-configurations/${env.DEMO_CONFIG_SLUG}`.
2. If 404, fall back to the user's default config from
   `GET /mcp-configurations/list`.
3. The resolved slug is what gets stamped into the Copy Claude Desktop config
   JSON and what Mode B uses to build the mcp-alien URL.

After first deploy, take the slug shown in the config chip and either set
`DEMO_CONFIG_SLUG` to it (env-pinned, faster) or just let the default
resolution keep working.

## Frontend architecture

- **`hooks/use-config.ts`** — TanStack Query against `/api/demo/config`,
  maintains a local draft layered on top of the server-saved config. `toggle`,
  `save`, `reset`. `view` field is what the panels render.
- **`hooks/use-pricing.ts`** — TanStack Query against `/api/demo/pricing`.
  `computeRoyalty(toolName, args, kind)` returns `{ royaltyEur, datasetIds }`.
- **`hooks/use-mode.ts`** — `dataflow | agentic`, persisted in sessionStorage.
- **`hooks/use-demo-events.tsx`** — typed event bus (`tool-call`, `usage`,
  `config-saved`, `reset-chat`). Ref-based listener registry so high-frequency
  tool calls don't re-render the provider.
- **`components/providers.tsx`** — wraps `QueryClientProvider` and
  `DemoEventsProvider` around the app.
- **`components/demo-app.tsx`** — orchestrator. Hosts the chat state,
  dispatches `runAgent(query)`, resolves tool calls into events.
- **`components/panels/*`** — pure renderers. Datasources, ExternalApis,
  Observability all consume from hooks + event bus.

## Deployment

```bash
docker build -t publisher-demo:0.1.0 .
helm lint helm/publisher-demo-chart
helm template publisher-demo helm/publisher-demo-chart \
  -f helm/publisher-demo-chart/values.yaml
```

`helm/argocd-application.yaml` targets the `publisher-demo` namespace.
Secrets (`ADMIN_OAT`, `ANTHROPIC_API_KEY`) come from ExternalSecret at
`secret/data/publisher-demo` — matching the alien-agents pattern.

## Troubleshooting

**"Backend disconnected" chip in the header** — `/api/demo/config` returned
non-200. Check the dev server logs for the upstream platform error. Likely
causes: bad OAT, wrong PLATFORM_API_URL, or the platform itself being down.

**Agent says "datacluster_* tools not exposed"** — mcp-alien returned zero
tools for the resolved slug. Sanity-check by calling mcp-alien directly:

```bash
curl -X POST "${MCP_ALIEN_URL}/mcp?config=${slug}" \
  -H "Authorization: Bearer ${ADMIN_OAT}" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}'
```

If `initialize` works but `tools/list` returns `tools: []`, the configuration
on the platform doesn't actually grant the user's org access to any cluster
tools. Fix the configuration via the platform's `/mcp/configure` UI.

**Mode A 503 platform-env-missing** — `DEMO_WORKFLOW_ID` is unset or
`PLATFORM_API_URL` is wrong. The route returns a structured 503 so the
client can show the error inline.

**Pricing comes back `{}`** — the resolver fetched the sources catalog but
none of the datasets or endpoints have non-zero prices. Set `access_price`
on at least one dataset to verify the wiring; the demo will then show
non-zero royalties on the matching tool calls.
