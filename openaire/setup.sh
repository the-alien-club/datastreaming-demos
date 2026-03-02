#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== OpenAIRE Demo Setup ==="

# 1. Create .env.local for the frontend if it doesn't exist
ENV_FILE="$SCRIPT_DIR/packages/frontend/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE ..."
  cat > "$ENV_FILE" <<'EOF'
ANTHROPIC_API_KEY=REDACTED_API_KEY
OPENAIRE_MCP_URL=https://openaire.mcp.alpha.alien.club/mcp
EOF
  echo "  Created .env.local with API key and prod MCP URL"
else
  echo "  .env.local already exists, skipping"
fi

# 2. Install and build viz-mcp (local stdio server, still needed)
echo ""
echo "=== Building viz-mcp ==="
cd "$SCRIPT_DIR/packages/viz-mcp"
npm install
npm run build
echo "  viz-mcp built successfully"

# 3. Install frontend dependencies
echo ""
echo "=== Installing frontend dependencies ==="
cd "$SCRIPT_DIR/packages/frontend"
npm install
echo "  Frontend dependencies installed"

echo ""
echo "=== Setup complete ==="
echo "Run ./run.sh to start the demo"
