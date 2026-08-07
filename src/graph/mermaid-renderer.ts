import type { GraphResult } from './module-analyzer';

/**
 * Render module graph as Mermaid diagram string.
 * Highlights cycle nodes in red.
 */
export function renderMermaid(result: GraphResult): string {
  const lines: string[] = ['graph TD'];

  // Add isolated nodes (no edges)
  const nodesWithEdges = new Set<string>();
  for (const edge of result.edges) {
    nodesWithEdges.add(edge.from);
    nodesWithEdges.add(edge.to);
  }
  for (const mod of result.modules) {
    if (!nodesWithEdges.has(mod.name)) {
      lines.push(`    ${mod.name}[${mod.name}]`);
    }
  }

  // Add edges
  for (const edge of result.edges) {
    lines.push(`    ${edge.from} --> ${edge.to}`);
  }

  // Highlight cycle nodes in red
  const cycleNodes = new Set(result.cycles.flat());
  for (const node of cycleNodes) {
    lines.push(`    style ${node} fill:#ef4444,stroke:#dc2626,color:#fff`);
  }

  return lines.join('\n');
}

/**
 * Render graph result as JSON for programmatic use.
 */
export function renderJson(result: GraphResult): string {
  return JSON.stringify(
    {
      modules: result.modules.map((m) => ({
        name: m.name,
        filePath: m.filePath,
        imports: m.imports,
        exports: m.exports,
        providers: m.providers,
      })),
      edges: result.edges,
      cycles: result.cycles,
      stats: result.stats,
    },
    null,
    2,
  );
}
