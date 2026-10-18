# MCP endpoints

The deployment is an MCP server: an MCP client (Claude, Cursor, any
Streamable-HTTP client) connects, discovers image models, and runs
generations through tools. Three mount modes serve different client shapes,
all behind the app-wide bearer gate.

## Sub-features

- `mcp-initialize` completes the MCP initialize handshake and returns
  serverInfo in an SSE frame.
- `mcp-tools-multi` exposes `list_models` and `describe_model` on the
  multi-model mounts (`/mcp`, `/mcp/smart`).
- `mcp-tools-simple` exposes a single pinned `run_model` on
  `/mcp/simple?model=@cf/...` with no discovery tools.
- `mcp-gated` rejects unauthenticated MCP calls with 401.

## How to get to it (user POV)

- Configure an MCP client with this deployment's `/mcp` URL and the bearer
  key, then ask it to list image models.
- `/mcp/smart` for an explicitly multi-model client; `/mcp/simple?model=@cf/...`
  for a client pinned to one model (e.g. an OpenWebUI image backend).

## Driving it with curl

Preconditions:

- Doctor prints all `ok`; bearer key `local-dev-user-key`.
- Every POST needs `Accept: application/json, text/event-stream`; the reply
  is an SSE stream whose first `data: {...}` line carries the JSON-RPC
  result.

- **Initialize.** `curl -s -X POST -H "Authorization: Bearer local-dev-user-key" -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"verify","version":"0"}}}' $B/mcp/message`.
  SSE frame; `data:` JSON contains `result.serverInfo`.
- **Tool list (multi).** Same shape with
  `{"jsonrpc":"2.0","id":2,"method":"tools/list"}` on `/mcp/message`.
  Tools include `list_models` and `describe_model`.
- **Tool list (simple).** Same on `/mcp/simple/message?model=@cf/black-forest-labs/flux-1-schnell`.
  Tools are `run_model` only — no discovery tools by design.
- **Unauthenticated contract.** Same POST without the Authorization header →
  `401`, no SSE frame.
- **Proof.** Save the raw SSE text of initialize and tools/list to
  `evidence/verify/<run-id>/mcp.txt`.

## Gotchas

- Without the `Accept: application/json, text/event-stream` header the
  Streamable HTTP transport rejects or mis-answers the call; a confusing
  failure here is usually the header, not the server.
- `/mcp/simple` without `?model=` serves `run_model` with no default —
  clients must pass the pin; that is contract, not a bug.
- Calling `run_model` without seeded provider credentials returns the
  ADR-001 error through the tool result — expected on this instance; it does
  not invalidate the initialize/tools proofs.
- Tools that mutate (none at this layer) would need read-back proof; all
  current tools are read (discovery) or fail-closed (generation).
