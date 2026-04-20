#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check setup was run
if [ ! -d "$SCRIPT_DIR/packages/viz-mcp/dist" ]; then
  echo "Error: viz-mcp not built. Run ./setup.sh first."
  exit 1
fi

if [ ! -d "$SCRIPT_DIR/packages/frontend/node_modules" ]; then
  echo "Error: Frontend dependencies not installed. Run ./setup.sh first."
  exit 1
fi

PORT="${PORT:-3002}"

echo "=== Starting OpenAIRE Demo ==="
echo "  MCP: ${OPENAIRE_MCP_URL:-<not set, will discover from plugin>}"
echo "  Viz: packages/viz-mcp (local stdio)"
echo "  UI:  http://localhost:$PORT"
echo ""

cd "$SCRIPT_DIR/packages/frontend"
PORT="$PORT" npm run dev -- -p "$PORT"
