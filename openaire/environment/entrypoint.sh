#!/bin/bash
set -e

PLUGIN_DIR="/app/.claude-plugins/alien-openscience"
MCP_URL="${OPENAIRE_MCP_URL:-}"

# --- Generate .mcp.json in plugin dir based on env vars ---
if [ -n "$MCP_URL" ]; then
  # Remote HTTP MCP server (like eval/production)
  cat > "$PLUGIN_DIR/.mcp.json" <<EOF
{
  "mcpServers": {
    "openaire-local": {
      "type": "http",
      "url": "$MCP_URL"
    }
  }
}
EOF
  echo "[entrypoint] MCP: HTTP → $MCP_URL"
else
  # Standalone: use embedded TypeScript MCP server via stdio
  cat > "$PLUGIN_DIR/.mcp.json" <<EOF
{
  "mcpServers": {
    "openaire-local": {
      "command": "node",
      "args": ["/app/packages/mcp/dist/index.js"]
    }
  }
}
EOF
  echo "[entrypoint] MCP: stdio → /app/packages/mcp/dist/index.js"
fi

# --- Write Claude Code settings (auto-allow MCP tools + standard tools) ---
SETTINGS='{"permissions":{"allow":["mcp__openaire-local__*","mcp__viz-tools__*","Bash","Read","Write","Edit","Glob","Grep","WebFetch","Task","WebSearch","Skill"]}}'

mkdir -p /etc/claude-code ~/.claude /app/.claude
echo "$SETTINGS" > /etc/claude-code/managed-settings.json
echo "$SETTINGS" > ~/.claude/settings.json
echo "$SETTINGS" > /app/.claude/settings.json

echo "[entrypoint] Claude Code settings written"

# --- Start Next.js ---
exec node packages/frontend/server.js
