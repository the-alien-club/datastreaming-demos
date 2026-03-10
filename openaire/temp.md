  The Designed Flow (Should Work)                                                                                                                                   
                                                                                                                                                                    
  Frontend (Better Auth)                    Agent SDK                         mcp-base (OIDC mode)
  ─────────────────────                    ─────────                         ────────────────────                                                                   
  1. User logs in via Authentik OAuth
  2. Better Auth stores session cookie
  3. auth.api.getAccessToken({
       providerId: "authentik"
     }) → Authentik access token                                                                                                                                    
  4. buildMcpServers(accessToken)                                                                                                                                   
     → { type:'http', url, headers:                                                                                                                                 
       { Authorization: Bearer <token> }}
                                           5. query() receives mcpServers
                                           6. Passes headers to HTTP transport
                                           7. StreamableHTTPClientTransport
                                              sends Bearer header
                                                                              8. load_access_token(token)
                                                                              9. Not in local store →
                                                                                 _introspect_external_token()
                                                                              10. OIDC discovery →
                                                                                  introspection_endpoint
                                                                              11. POST introspect with
                                                                                  client credentials
                                                                              12. active: true →
                                                                                  set_upstream_token()
                                                                                  → tool executes with auth