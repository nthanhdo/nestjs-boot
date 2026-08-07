import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { detectCycles } from './cycle-detector';

export interface ModuleNode {
  name: string;
  filePath: string;
  imports: string[];
  exports: string[];
  providers: string[];
}

export interface GraphResult {
  modules: ModuleNode[];
  edges: { from: string; to: string }[];
  cycles: string[][];
  stats: {
    totalModules: number;
    totalEdges: number;
    maxFanOut: { module: string; count: number };
    maxFanIn: { module: string; count: number };
    cycleCount: number;
  };
}

/**
 * Recursively find all files matching a pattern in a directory.
 */
function walkDir(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === '.git') continue;
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(...walkDir(full, ext));
      } else if (entry.endsWith(`.module${ext}`)) {
        results.push(full);
      }
    } catch {
      // skip unreadable
    }
  }
  return results;
}

/**
 * Parse a single module file for @Module metadata using regex.
 */
function parseModuleFile(filePath: string): ModuleNode | null {
  const content = readFileSync(filePath, 'utf-8');

  // Find class name
  const classMatch = content.match(/(?:export\s+)?class\s+(\w+Module)\b/);
  if (!classMatch) return null;

  const name = classMatch[1];

  // Parse @Module decorator block
  const decoratorMatch = content.match(/@Module\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  if (!decoratorMatch) {
    return { name, filePath, imports: [], exports: [], providers: [] };
  }

  const block = decoratorMatch[1];

  function extractArray(key: string): string[] {
    const regex = new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`);
    const match = block.match(regex);
    if (!match) return [];

    const items = match[1];
    // Extract module/service names — look for identifiers ending in Module/Service/etc.
    const refs = items.match(/\b(\w+(?:Module|Service|Guard|Interceptor|Pipe|Filter))\b/g) || [];
    // Deduplicate and exclude self
    return [...new Set(refs.filter((r) => r !== name))];
  }

  const imports = extractArray('imports').filter((i) => i.endsWith('Module'));
  const exports = extractArray('exports');
  const providers = extractArray('providers');

  return { name, filePath, imports, exports, providers };
}

/**
 * Analyze module dependencies from TS source or compiled JS.
 * Strategy: scan for @Module({ imports: [...] }) decorator metadata.
 */
export function analyzeModules(projectRoot: string): GraphResult {
  // Prefer src/ for TS, fallback to dist/ for compiled JS
  let searchDir = join(projectRoot, 'src');
  let ext = '.ts';
  if (!existsSync(searchDir)) {
    searchDir = join(projectRoot, 'dist');
    ext = '.js';
  }

  if (!existsSync(searchDir)) {
    return {
      modules: [],
      edges: [],
      cycles: [],
      stats: {
        totalModules: 0,
        totalEdges: 0,
        maxFanOut: { module: '', count: 0 },
        maxFanIn: { module: '', count: 0 },
        cycleCount: 0,
      },
    };
  }

  const moduleFiles = walkDir(searchDir, ext);
  const modules: ModuleNode[] = [];

  for (const file of moduleFiles) {
    const mod = parseModuleFile(file);
    if (mod) modules.push(mod);
  }

  // Build known module name set for filtering edges
  const knownModules = new Set(modules.map((m) => m.name));

  // Build edges (only to known modules)
  const edges: { from: string; to: string }[] = [];
  for (const mod of modules) {
    for (const imp of mod.imports) {
      if (knownModules.has(imp)) {
        edges.push({ from: mod.name, to: imp });
      }
    }
  }

  // Detect cycles using Tarjan's SCC
  const cycles = detectCycles(
    modules.map((m) => m.name),
    edges,
  );

  // Compute stats
  const fanOutMap = new Map<string, number>();
  const fanInMap = new Map<string, number>();
  for (const mod of modules) {
    fanOutMap.set(mod.name, 0);
    fanInMap.set(mod.name, 0);
  }
  for (const edge of edges) {
    fanOutMap.set(edge.from, (fanOutMap.get(edge.from) || 0) + 1);
    fanInMap.set(edge.to, (fanInMap.get(edge.to) || 0) + 1);
  }

  let maxFanOut = { module: '', count: 0 };
  let maxFanIn = { module: '', count: 0 };
  for (const [mod, count] of fanOutMap) {
    if (count > maxFanOut.count) maxFanOut = { module: mod, count };
  }
  for (const [mod, count] of fanInMap) {
    if (count > maxFanIn.count) maxFanIn = { module: mod, count };
  }

  return {
    modules,
    edges,
    cycles,
    stats: {
      totalModules: modules.length,
      totalEdges: edges.length,
      maxFanOut,
      maxFanIn,
      cycleCount: cycles.length,
    },
  };
}
