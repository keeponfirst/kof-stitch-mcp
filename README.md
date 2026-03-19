# @keeponfirst/kof-stitch-mcp

> **Part of [KOF Agentic Workflow](https://github.com/keeponfirst/keeponfirst-agentic-workflow-starter)** - A complete agentic workflow for building modern applications. Check out the full workflow if you're interested in how this tool fits into the bigger picture.

---

## ☕ Support this project

If this project helps you, you can support development here:

👉 https://buymeacoffee.com/keeponfirst

<a href="https://www.buymeacoffee.com/keeponfirst" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="45" />
</a>

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
- `export_project` - Batch export all screens (HTML + PNG) with manifest
- `fetch_design_md` - Download project's DESIGN.md design system spec (supports [Stitch Vibe Design](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/))
- `init_stitch_project` - **NEW** Initialize `.stitch/` directory for [stitch-skills](https://github.com/google-labs-code/stitch-skills) compatibility

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

"Download the DESIGN.md from my Stitch project xyz789"
→ Uses fetch_design_md tool
→ Saves DESIGN.md to your working directory
→ AI coding agents can now follow your design system when generating UI
```

### DESIGN.md Workflow (Vibe Design)

Google Stitch's new **DESIGN.md** feature (launched 2026-03-18) lets you define your design system in a portable Markdown file — colors, typography, spacing, and component patterns — that AI agents can read and follow.

```
1. Design in Stitch → export DESIGN.md from project settings
2. fetch_design_md → saves DESIGN.md to your repo
3. Claude Code reads DESIGN.md → generates consistent UI components
```

## stitch-skills Integration

[stitch-skills](https://github.com/google-labs-code/stitch-skills) is Google's official Agent Skills library that adds advanced workflows on top of Stitch — multi-page loops, React component conversion, Remotion video walkthroughs, and more.

**kof-stitch-mcp is the authentication layer that makes stitch-skills work** in Claude Code and Cursor, where Google OAuth is not natively supported.

### Why use them together?

| Without stitch-skills | With stitch-skills |
|-----------------------|--------------------|
| Manual prompt for each screen | `stitch-loop` auto-generates all pages in sequence |
| AI guesses design rules | Every screen enforced against `DESIGN.md` |
| Raw HTML output | `react-components` converts to modular React/Vite components |
| Static designs | `remotion` generates interactive video walkthroughs |

### Setup (one-time)

**Step 1 — Configure kof-stitch-mcp** (authentication bridge)

Add to your `.mcp.json`:
```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "@keeponfirst/kof-stitch-mcp"],
      "env": { "GOOGLE_CLOUD_PROJECT": "your-project-id" }
    }
  }
}
```

**Step 2 — Install stitch-skills**
```bash
# Install the skills you need
npx skills add google-labs-code/stitch-skills --skill stitch-design
npx skills add google-labs-code/stitch-skills --skill stitch-loop
npx skills add google-labs-code/stitch-skills --skill design-md
npx skills add google-labs-code/stitch-skills --skill react-components
```

**Step 3 — Initialize your project**

In Claude Code, run:
```
Initialize my Stitch project <projectId> with init_stitch_project
```

This creates:
```
.stitch/
├── metadata.json   ← screens map + project config (stitch-skills format)
├── DESIGN.md       ← design system template pre-filled from your Stitch theme
├── SITE.md         ← site vision and page checklist
└── designs/        ← output directory for HTML + PNG exports
```

**Step 4 — Fill in the templates**

Edit `.stitch/DESIGN.md` to complete your color palette, typography, and component rules. Edit `.stitch/SITE.md` to describe your site goals and pages.

Or let the `design-md` skill analyze your existing screens and fill in DESIGN.md automatically.

**Step 5 — Run advanced workflows**
```
Run stitch-loop to generate all pages in my site
```
```
Convert my Stitch screens to React components
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
