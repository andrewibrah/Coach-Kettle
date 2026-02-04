# Coach Kettle MCP Server

MCP server for Coach Kettle development. Provides documentation, file skeletons, and codebase analysis tools.

---

## Quick Start

### 1. Build the Docker image

```bash
cd mcp
docker build -t coach-kettle-mcp .
```

### 2. Test the server

```bash
# Run interactively to test
docker run -it --rm \
  -v "$(pwd)/../docs:/docs:ro" \
  -v "$(pwd)/..:/codebase:ro" \
  coach-kettle-mcp
```

### 3. Configure Claude Code

Add to `~/.claude.json` or `.claude/settings.json`:

```json
{
  "mcpServers": {
    "coach-kettle": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "/path/to/WorkoutTracker/docs:/docs:ro",
        "-v", "/path/to/WorkoutTracker:/codebase:ro",
        "coach-kettle-mcp"
      ]
    }
  }
}
```

**Replace `/path/to/WorkoutTracker` with your actual path.**

---

## Available Tools

| Tool | Description |
|------|-------------|
| `list_docs` | List all documentation files |
| `get_doc` | Get full content of a doc (e.g., `get_doc("04-parsing")`) |
| `search_docs` | Search docs for a query |
| `get_file_skeleton` | Get skeleton of a source file |
| `get_directory_map` | Map files in a directory |
| `get_implementation_guide` | **Best starting point** - get doc + skeletons for a task |
| `analyze_area` | Deep dive into an app area |
| `find_related_files` | Find files related to a component/hook |

---

## Usage Examples

### Starting a task

```
Use tool: get_implementation_guide
Args: { "task": "add pause rep parsing" }
```

Returns: relevant documentation + file skeletons + patterns to follow.

### Understanding a file

```
Use tool: get_file_skeleton
Args: { "path": "lib/structuredGate.ts" }
```

Returns: exports, imports, types, and structure without full implementation.

### Exploring a directory

```
Use tool: get_directory_map
Args: { "path": "components/modals" }
```

Returns: tree view with file types and line counts.

### Deep dive into an area

```
Use tool: analyze_area
Args: { "area": "auth" }
```

Valid areas: `auth`, `workout`, `parsing`, `storage`, `api`, `components`, `hooks`, `modals`, `onboarding`, `settings`, `pr-tracking`, `templates`, `theming`

---

## Development (without Docker)

### Local setup

```bash
cd mcp
npm install
npm run build
```

### Run locally

```bash
DOCS_PATH=../docs CODEBASE_PATH=.. node dist/index.js
```

### Test with MCP inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

---

## Rebuilding

After making changes to the MCP server:

```bash
cd mcp
docker build -t coach-kettle-mcp .
```

---

## Troubleshooting

### "File not found" errors

- Ensure volumes are mounted correctly
- Check paths are absolute in Claude config
- Verify files exist in the mounted directories

### Server not responding

```bash
# Test the container directly
docker run -it --rm coach-kettle-mcp

# Should print: "Coach Kettle MCP server running on stdio"
```

### Permission issues

- Ensure Docker has access to the mounted directories
- On macOS, check System Settings → Privacy → Files and Folders

---

## File Structure

```
mcp/
├── Dockerfile
├── package.json
├── tsconfig.json
├── run_docker.md          # This file
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # MCP server setup
│   ├── tools/
│   │   ├── docs.ts        # Documentation tools
│   │   ├── skeleton.ts    # File skeleton tools
│   │   └── analysis.ts    # Analysis tools
│   ├── parsers/
│   │   └── typescript.ts  # TS/TSX skeleton parser
│   └── utils/
│       ├── paths.ts       # Path utilities
│       └── files.ts       # File utilities
└── dist/                  # Compiled output (generated)
```
