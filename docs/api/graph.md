# Graph API Reference

> Static analysis of NestJS module dependency graphs: cycle detection, fan-out/fan-in stats, and Mermaid/JSON rendering.

---

## Functions

### `analyzeModules(projectRoot: string): GraphResult`

Scan a NestJS project for module files and build a dependency graph.

**Strategy:** walks `{projectRoot}/src/**/*.module.ts` (falls back to `{projectRoot}/dist/**/*.module.js` when `src/` does not exist) and parses `@Module({ imports, exports, providers })` decorator metadata via regex.

| Parameter | Type | Description |
|-----------|------|-------------|
| `projectRoot` | `string` | Absolute path to the project root directory. |

**Returns:** [`GraphResult`](#graphresult)

```ts
import { analyzeModules } from 'nestjs-boot/graph';

const result = analyzeModules('/path/to/my-app');
console.log(result.stats);
// {
//   totalModules: 12,
//   totalEdges: 18,
//   maxFanOut: { module: 'AppModule', count: 8 },
//   maxFanIn: { module: 'SharedModule', count: 5 },
//   cycleCount: 0,
// }
```

---

### `detectCycles(nodes: string[], edges: { from: string; to: string }[]): string[][]`

Detect cycles in a directed graph using **Tarjan's Strongly Connected Components** algorithm.

| Parameter | Type | Description |
|-----------|------|-------------|
| `nodes` | `string[]` | All node names in the graph. |
| `edges` | `{ from: string; to: string }[]` | Directed edges. Unknown node names in edges are silently ignored. |

**Returns:** `string[][]` — an array of cycles. Each cycle is an array of node names in traversal order. An empty array means the graph is acyclic.

```ts
import { detectCycles } from 'nestjs-boot/graph';

const cycles = detectCycles(
  ['A', 'B', 'C'],
  [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }],
);
// [['A', 'B']]
```

---

### `renderMermaid(result: GraphResult): string`

Render a `GraphResult` as a **Mermaid** `graph TD` diagram string.

- Isolated nodes (no edges) are emitted as standalone nodes.
- Nodes involved in cycles are styled with a red fill (`#ef4444`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `result` | [`GraphResult`](#graphresult) | Output of `analyzeModules()` or a manually constructed graph. |

**Returns:** `string` — Mermaid diagram source. Paste into a `.mmd` file or a Mermaid-enabled Markdown block.

```ts
import { analyzeModules, renderMermaid } from 'nestjs-boot/graph';

const result = analyzeModules(process.cwd());
console.log(renderMermaid(result));
// graph TD
//     AppModule --> AuthModule
//     AppModule --> UserModule
//     style AuthModule fill:#ef4444,...
```

---

### `renderJson(result: GraphResult): string`

Render a `GraphResult` as a pretty-printed JSON string for programmatic consumption or CI artifact storage.

| Parameter | Type | Description |
|-----------|------|-------------|
| `result` | [`GraphResult`](#graphresult) | Output of `analyzeModules()`. |

**Returns:** `string` — JSON with `modules`, `edges`, `cycles`, and `stats` fields.

---

## Interfaces

### `ModuleNode`

Represents a single discovered module.

```ts
interface ModuleNode {
  name: string;       // Class name, e.g. 'UserModule'
  filePath: string;   // Absolute path to the .module.ts file
  imports: string[];  // Names of imported modules (only modules ending in 'Module')
  exports: string[];  // Names of exported providers / modules
  providers: string[]; // Names of declared providers
}
```

### `GraphResult`

Full output of `analyzeModules()`.

```ts
interface GraphResult {
  modules: ModuleNode[];
  edges: { from: string; to: string }[];
  cycles: string[][];  // Each inner array = one cycle (Tarjan SCC with 2+ nodes)
  stats: {
    totalModules: number;
    totalEdges: number;
    maxFanOut: { module: string; count: number }; // Module with most outgoing edges
    maxFanIn:  { module: string; count: number }; // Module with most incoming edges
    cycleCount: number;
  };
}
```
