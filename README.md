# @keeponfirst/kof-stitch-mcp

> **Part of [KOF Agentic Workflow](https://github.com/keeponfirst/keeponfirst-agentic-workflow-starter)** - A complete agentic workflow for building modern applications. Check out the full workflow if you're interested in how this tool fits into the bigger picture.

---

MCP (Model Context Protocol) Server for [Google Stitch](https://stitch.withgoogle.com/) - AI-powered UI/UX design tool.

Works with **Claude Code**, **Cursor**, and any MCP-compatible client.

## Why This Package?

Google Stitch provides an official MCP endpoint at `stitch.googleapis.com/mcp`, but it requires:
- Dynamic OAuth tokens from Google Cloud ADC
- Proper authentication headers

Most MCP clients (Claude Code, Cursor) don't support Google's `google_credentials` auth type natively. This package wraps the official API as a **stdio MCP server** that handles authentication automatically.

```
Your MCP Client → kof-stitch-mcp → Google Stitch API
     (stdio)         (handles auth)      (HTTP)
```

## Features

### Official Stitch Tools (via Google API)
- `list_projects` - List all your Stitch projects
- `get_project` - Get project details
- `create_project` - Create a new project
- `list_screens` - List screens in a project
- `get_screen` - Get screen details
- `generate_screen_from_text` - Generate UI design from text prompt

### Additional Tools (by this package)
- `fetch_screen_code` - Download screen HTML code directly
- `fetch_screen_image` - Download screen screenshot as PNG
- `export_project` - **NEW** Batch export all screens (HTML + PNG) with manifest

## Prerequisites

1. **Node.js 18+**

2. **Google Cloud CLI** with Application Default Credentials:
   ```bash
   # Install gcloud: https://cloud.google.com/sdk/docs/install

   # Login
   gcloud auth application-default login

   # Set project
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Enable Stitch MCP API**:
   ```bash
   gcloud beta services mcp enable stitch.googleapis.com --project=YOUR_PROJECT_ID
   ```

## Installation

### Option 1: npx (Recommended)

No installation needed. Configure directly in your MCP client.

### Option 2: Global Install

```bash
npm install -g @keeponfirst/kof-stitch-mcp
```

### Option 3: Local Install

```bash
npm install @keeponfirst/kof-stitch-mcp
```

## Configuration

### Claude Code

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "@keeponfirst/kof-stitch-mcp"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id"
      }
    }
  }
}
```

Or add via CLI:

```bash
claude mcp add stitch --command "npx" --args "-y" "@keeponfirst/kof-stitch-mcp" \
  --env GOOGLE_CLOUD_PROJECT=your-project-id
```

### Cursor

Add to Cursor MCP settings:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "@keeponfirst/kof-stitch-mcp"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id"
      }
    }
  }
}
```

### Other MCP Clients

Any client supporting stdio MCP servers can use:

```bash
GOOGLE_CLOUD_PROJECT=your-project-id npx @keeponfirst/kof-stitch-mcp
```

## Usage Examples

After configuration, you can use natural language in your MCP client:

```
"List my Stitch projects"
→ Uses list_projects tool

"Generate a mobile login screen with email and social login"
→ Uses generate_screen_from_text tool

"Download the HTML code for screen abc123 in project xyz789"
→ Uses fetch_screen_code tool
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Yes | Your Google Cloud Project ID |
| `GCLOUD_PROJECT` | Alt | Alternative to GOOGLE_CLOUD_PROJECT |

## Troubleshooting

### "gcloud CLI not found"

Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install

### "Your default credentials were not found"

```bash
gcloud auth application-default login
```

### "Stitch API has not been used in project"

Enable the MCP API:
```bash
gcloud beta services mcp enable stitch.googleapis.com --project=YOUR_PROJECT_ID
```

### "Permission denied"

Ensure your account has the required role:
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="user:your-email@gmail.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

## How It Works

1. On startup, the server verifies gcloud authentication
2. For each MCP tool call:
   - Gets fresh OAuth token via `gcloud auth application-default print-access-token`
   - Calls `https://stitch.googleapis.com/mcp` with proper headers
   - Returns result to MCP client

## Related

- [Google Stitch](https://stitch.withgoogle.com/) - Official Stitch web app
- [Stitch MCP Docs](https://stitch.withgoogle.com/docs/mcp/setup) - Official documentation
- [MCP Protocol](https://modelcontextprotocol.io/) - Model Context Protocol spec
- [KeepOnFirst Agentic Workflow](https://github.com/keeponfirst/keeponfirst-agentic-workflow-starter) - Workflow starter using this package

## License

MIT © [KeepOnFirst](https://github.com/keeponfirst)
