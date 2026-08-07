/**
 * Detect cycles in a directed graph using Tarjan's Strongly Connected Components algorithm.
 * Returns array of cycles, each cycle = array of node names forming the cycle.
 * Empty array = no cycles (acyclic graph).
 */
export function detectCycles(
  nodes: string[],
  edges: { from: string; to: string }[],
): string[][] {
  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node, []);
  }
  for (const { from, to } of edges) {
    // Only add edges for known nodes
    if (adj.has(from) && adj.has(to)) {
      adj.get(from)!.push(to);
    }
  }

  // Tarjan's SCC
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    // Root of SCC
    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      // Only report SCCs with 2+ nodes (those are actual cycles)
      if (scc.length > 1) {
        scc.reverse(); // Put in traversal order
        sccs.push(scc);
      }
    }
  }

  for (const node of nodes) {
    if (!indices.has(node)) {
      strongconnect(node);
    }
  }

  return sccs;
}
