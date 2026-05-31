# windmill-mcp-server

MCP server that exposes [Windmill](https://www.windmill.dev/) flows to Archestra and renders them as
interactive MCP Apps (SEP-1865). Flows show up as an editable node graph in chat: list a flow, edit a
node's inputs, create a flow, or run one and see the result inline.

It talks to Windmill over the REST API (`/api/w/{workspace}/flows/*` and the job endpoints). Windmill
ships its own MCP server since v1.484, but that returns plain JSON with no UI; this server adds the App
layer on top.

## Configuration

Set per install (prompted in the Archestra MCP registry):

| Env var              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `WINDMILL_BASE_URL`  | Base URL of the Windmill instance, e.g. `https://app.windmill.dev` |
| `WINDMILL_WORKSPACE` | Workspace id                                             |
| `WINDMILL_TOKEN`     | API token (Account settings -> Tokens)                   |

## Transport

Streamable HTTP on `:8080` (path `/mcp`). Matches the `streamable-http` runtime in Archestra's K8s
MCP server orchestration.

## Local development

```bash
npm install
npm run dev      # tsx watch on src/server.ts
npm test
npm run build    # tsc -> dist/
```
