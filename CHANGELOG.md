# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-03-19

### Added
- New tool: `fetch_design_md` - Download a project's DESIGN.md design system spec file
  - Supports Google Stitch's new DESIGN.md feature (launched 2026-03-18)
  - Saves DESIGN.md locally for use by AI coding agents (Claude Code, Cursor, etc.)
  - Recursive URL search to handle API response changes
  - Optional `outputPath` parameter for custom save location

## [1.1.0] - 2026-01-23

### Added
- New tool: `export_project` - Batch export all screens (HTML + PNG) with manifest.json
- GitHub Actions CI workflow (Node 18/20/22)
- GitHub Actions npm publish workflow (on version tags)
- `CHANGELOG.md` and `CONTRIBUTING.md`

## [1.0.0] - 2026-01-23

### Added
- Initial release
- MCP Server wrapping Google Stitch API (`stitch.googleapis.com/mcp`)
- Automatic gcloud ADC authentication
- Official Stitch tools: `list_projects`, `get_project`, `create_project`, `list_screens`, `get_screen`, `generate_screen_from_text`
- Custom tools: `fetch_screen_code`, `fetch_screen_image`
- Support for Claude Code, Cursor, and any MCP-compatible client
