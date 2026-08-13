# visualize-flow

Interactive animated flow visualizer for nestjs-boot — a static HTML/JS/CSS tool that illustrates how all major subsystems work at runtime.

## What it does

Opens in any browser with no build step. Covers 10 sections, each with animated step-through diagrams:

| Section | What you see |
|---|---|
| Boot & Config | `createApp()` sequence, conditional module loading |
| Request & Response | HTTP lifecycle, cache hit/miss, error paths, response envelope |
| Auth Flows | JWT login/refresh, token revocation, OAuth2, API key, RBAC, sessions, TOTP 2FA |
| Database & Cache | Reader/writer split, multi-layer cache, stampede prevention, tag invalidation |
| Transport & Comms | gRPC lifecycle, ResilientClient, inter-service auth propagation, RPC error handling |
| Events & CQRS | Event fan-out, emitAndWait, CQRS cycle, sagas, outbox pattern, event replay |
| Observability | Correlation ID, trace spans, metrics, structured logging, error reporting |
| Platform | Multi-tenancy, file upload, webhooks, migrations, graceful shutdown |
| DI & Architecture | Circular dep detection, contract injection, module graph analysis, layer validation |
| Module Map | Interactive dependency graph of 55+ modules — click to highlight, search, filter by category |

## How to view

```bash
# Just open the file — no server needed
open packages/visualize-flow/index.html

# Or serve it (optional, for relative-path hygiene)
npx serve packages/visualize-flow
```

Controls at the top: **Speed slider** (0.25× – 3×) and **Pause/Resume** button apply to all animated flows.

## Screenshot

> _Drop a screenshot here after first run._

## Files

```
packages/visualize-flow/
├── index.html   # entry point — all tabs and canvases
├── css/
│   └── flow.css # layout, animation tokens, dark theme
└── js/
    └── flow.js  # canvas renderers, tab routing, module map graph
```
