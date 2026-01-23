# Contributing to @keeponfirst/kof-stitch-mcp

Thank you for your interest in contributing!

## Development Setup

```bash
# Clone the repo
git clone https://github.com/keeponfirst/kof-stitch-mcp.git
cd kof-stitch-mcp

# Install dependencies
npm install

# Run tests (requires gcloud auth)
GOOGLE_CLOUD_PROJECT=your-project npm test
```

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test locally with your MCP client
5. Commit with conventional commits: `feat:`, `fix:`, `docs:`
6. Push and create a Pull Request

## Releasing

Maintainers only:

```bash
# Bump version
npm version patch  # or minor/major

# Push with tags
git push && git push --tags
```

GitHub Actions will automatically publish to npm when a version tag is pushed.

## Code Style

- Use ES6+ features
- Add JSDoc comments for public functions
- Keep functions focused and small
- Handle errors gracefully with helpful messages

## Questions?

Open an issue on GitHub!
