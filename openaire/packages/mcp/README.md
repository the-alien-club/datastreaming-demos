# OpenAIRE MCP Server

Model Context Protocol (MCP) server providing access to OpenAIRE's research intelligence data.

## Features

- **Research Product Search**: Search 600M+ publications, datasets, and software
- **Citation Networks**: Build citation networks from 2.25B citation relationships
- **Trend Analysis**: Analyze research trends over time
- **Collaboration Networks**: Discover research collaborations

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Tools Provided

### 1. search_research_products
Search OpenAIRE for research products with advanced filtering.

**Input:**
```json
{
  "query": "machine learning",
  "type": "publication",
  "openAccess": true,
  "dateRange": {
    "from": "2023-01-01",
    "to": "2023-12-31"
  },
  "sortBy": "citations",
  "limit": 10
}
```

### 2. get_citation_network
Build a citation network for a research product.

**Input:**
```json
{
  "identifier": "doi_or_openaire_id",
  "depth": 2,
  "direction": "both"
}
```

### 3. get_research_product_details
Get detailed information about a specific research product.

**Input:**
```json
{
  "identifier": "doi_or_openaire_id"
}
```

## Architecture

```
MCP Server
├── API Clients
│   ├── OpenAIRE Graph API
│   └── ScholeXplorer API
├── Tools
│   ├── Search
│   ├── Citations
│   └── Details
└── Utils
    ├── Cache
    ├── Logger
    └── Validators
```

## API Endpoints Used

- **OpenAIRE Graph API**: `https://api.openaire.eu/search/`
- **ScholeXplorer API**: `https://api.openaire.eu/scholexplorer/v3/`

## Testing

```bash
# Test search tool directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_research_products","arguments":{"query":"quantum computing","limit":5}}}' | npm start
```

## Integration with Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "openaire-research": {
      "command": "node",
      "args": ["/path/to/packages/mcp/dist/index.js"]
    }
  }
}
```

## License

MIT
