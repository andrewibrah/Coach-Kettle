# Coach Kettle MCP

## Setup

```bash
# Build
cd mcp && docker build -t coach-kettle-mcp .

# Configure (~/.claude.json)
{
  "mcpServers": {
    "kettle": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
        "-v", "/path/to/WorkoutTracker/docs:/docs:ro",
        "-v", "/path/to/WorkoutTracker:/codebase:ro",
        "coach-kettle-mcp"]
    }
  }
}
```

## Tools

| Tool | Use |
|------|-----|
| `guide` | **Start here.** Get doc + skeletons for a task |
| `skeleton` | Get file structure (exports, imports, hooks) |
| `map` | See directory tree with line counts |
| `search` | Search docs |
| `area` | Deep dive into auth/workout/parsing/etc |
| `related` | Find files using a component/hook |

## Resources

All docs exposed as `docs://` resources:
- `docs://01-auth`
- `docs://04-parsing`
- etc.

## Examples

```
guide({ task: "add pause rep parsing" })
skeleton({ path: "lib/structuredGate.ts" })
map({ path: "components/modals" })
area({ name: "auth" })
```

## Dev (no Docker)

```bash
cd mcp && npm install && npm run build
DOCS_PATH=../docs CODEBASE_PATH=.. node dist/index.js
```
