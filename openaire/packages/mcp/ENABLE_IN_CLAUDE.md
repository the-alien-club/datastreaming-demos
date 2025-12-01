# How to Enable OpenAIRE MCP Server in Claude Code

## Step 1: Locate Your Claude Code Config

The configuration file location depends on your OS:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## Step 2: Add MCP Server Configuration

Add this to your `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "openaire-research": {
      "command": "node",
      "args": [
        "/home/xqua/Documents/Work/Alien/AIRM/datastreaming-demos/openaire/packages/mcp/dist/index.js"
      ],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Important:** If you already have other MCP servers configured, add `"openaire-research"` to the existing `mcpServers` object, don't replace it!

## Step 3: Restart Claude Code

After saving the configuration file, restart Claude Code (or reload the VS Code window if using Claude Code extension).

## Step 4: Verify It's Working

You can verify the MCP server is connected by:

1. Opening Claude Code
2. Looking for the MCP server icon or notification
3. Or asking me: "What MCP tools do you have access to?"

I should be able to see:
- `search_research_products` - Search OpenAIRE for research papers
- `get_research_product_details` - Get detailed paper information

## Step 5: Test It Out!

Once configured, you can ask me things like:

- "Find recent papers about quantum computing"
- "Search for open access machine learning publications from 2023"
- "Get details about paper with DOI 10.1234/example"

And I'll use the OpenAIRE MCP server to answer!

## Troubleshooting

### Server Not Showing Up

1. **Check the path**: Make sure the path in the config points to your actual `dist/index.js` file
2. **Build the server**: Run `npm run build` in the mcp directory
3. **Check Node.js**: Ensure Node.js is installed and accessible via `node` command
4. **Check logs**: Look in Claude Code logs for MCP server errors

### Permission Issues

On Linux/macOS, you may need to ensure the script is executable:

```bash
chmod +x /home/xqua/Documents/Work/Alien/AIRM/datastreaming-demos/openaire/packages/mcp/dist/index.js
```

### Alternative: Environment-Specific Path

If you're working across multiple machines, you can use environment variables:

```json
{
  "mcpServers": {
    "openaire-research": {
      "command": "node",
      "args": [
        "${workspaceFolder}/packages/mcp/dist/index.js"
      ]
    }
  }
}
```

## What This Enables

Once configured, I (Claude) will have access to:

### 1. Real-time Research Search
- Search 1M+ research papers from OpenAIRE
- Filter by type, open access, date range
- Sort by relevance, citations, influence

### 2. Detailed Paper Information
- Full metadata for any research product
- Authors with affiliations and ORCIDs
- Abstracts, subjects, funding information

### 3. Development Benefits
- I can test the MCP server while building the frontend
- Debug issues with real data
- Validate API responses
- Help design better UI components based on actual data

## Next Steps

After enabling this:

1. **Test the tools** - Ask me to search for papers
2. **Build the frontend** - I'll help adapt the UI to use these tools
3. **Add more tools** - We can add citation networks, trend analysis, etc.

---

**Ready?** Add the configuration, restart Claude Code, and let me know when it's set up!
