#!/bin/bash
set -e

# --- Write Claude Code settings with marketplace + plugin config ---
# The SDK loads the plugin from GitHub (equivalent of: /plugin marketplace add the-alien-club/claude-marketplace#local)
MARKETPLACE_REPO="${MARKETPLACE_REPO:-the-alien-club/claude-marketplace}"
MARKETPLACE_BRANCH="${MARKETPLACE_BRANCH:-local}"

SETTINGS=$(cat <<ENDJSON
{
  "permissions": {
    "allow": [
      "mcp__openaire-local__*",
      "mcp__viz-tools__*",
      "Bash", "Read", "Write", "Edit", "Glob", "Grep",
      "WebFetch", "Task", "WebSearch", "Skill"
    ]
  },
  "extraKnownMarketplaces": {
    "alien-openscience": {
      "source": {
        "source": "github",
        "repo": "$MARKETPLACE_REPO",
        "ref": "$MARKETPLACE_BRANCH"
      }
    }
  },
  "enabledPlugins": {
    "openaire@alien-openscience": true
  }
}
ENDJSON
)

mkdir -p /etc/claude-code ~/.claude /app/.claude
echo "$SETTINGS" > /etc/claude-code/managed-settings.json
echo "$SETTINGS" > ~/.claude/settings.json
echo "$SETTINGS" > /app/.claude/settings.json

echo "[entrypoint] Marketplace: $MARKETPLACE_REPO#$MARKETPLACE_BRANCH"
echo "[entrypoint] Plugin: openaire@alien-openscience"
echo "[entrypoint] Settings written"

# --- Start Next.js ---
exec node packages/frontend/server.js
