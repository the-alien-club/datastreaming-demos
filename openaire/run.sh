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

echo "=== Starting OpenAIRE Demo ==="
echo "  MCP: ${OPENAIRE_MCP_URL:-https://openaire.mcp.alpha.alien.club/mcp} (remote)"
echo "  Viz: packages/viz-mcp (local stdio)"
echo "  UI:  http://localhost:3000"
echo ""

cd "$SCRIPT_DIR/packages/frontend"
npm run dev
