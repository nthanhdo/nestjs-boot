/**
 * DI Error Handler — catches NestFactory.create() failures related to
 * dependency injection and provides clear, actionable error messages.
 *
 * This is the #1 DX gap for new nestjs-boot users. NestJS DI errors are
 * notoriously cryptic; this handler parses them and suggests specific fixes.
 */

export interface DiErrorInfo {
  type: 'circular' | 'unresolved' | 'unknown';
  modules: string[];
  providers: string[];
  originalMessage: string;
  suggestion: string;
}

/**
 * Parse a NestJS DI error message and return structured info with fix suggestions.
 */
export function parseDiError(error: Error): DiErrorInfo | null {
  const msg = error.message || '';

  // Circular dependency pattern:
  // "A circular dependency has been detected. Please, make sure that each side
  // of a bi-directional relationships are decorated with "forwardRef()""
  // or "Nest cannot create the <Module> instance. The module at index [X]
  // of the <ParentModule> "imports" array is undefined."
  if (/circular dependency/i.test(msg)) {
    const modules = extractModuleNames(msg);
    const providers = extractProviderNames(msg);

    return {
      type: 'circular',
      modules,
      providers,
      originalMessage: msg,
      suggestion: buildCircularSuggestion(modules, providers),
    };
  }

  // Unresolved dependency pattern:
  // "Nest can't resolve dependencies of the <Provider> (?). Please make sure
  // that the argument <Dep> at index [X] is available in the <Module> context."
  if (/can't resolve dependencies/i.test(msg) || /cannot resolve dependencies/i.test(msg)) {
    const modules = extractModuleNames(msg);
    const providers = extractProviderNames(msg);
    const missingDep = extractMissingDep(msg);

    return {
      type: 'unresolved',
      modules,
      providers: missingDep ? [missingDep, ...providers] : providers,
      originalMessage: msg,
      suggestion: buildUnresolvedSuggestion(missingDep, modules, providers),
    };
  }

  return null;
}

/**
 * Format a DI error with actionable guidance for the developer.
 */
export function formatDiError(info: DiErrorInfo): string {
  const lines: string[] = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║  nestjs-boot: Dependency Injection Error Detected          ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ];

  if (info.type === 'circular') {
    lines.push('🔄 CIRCULAR DEPENDENCY');
  } else if (info.type === 'unresolved') {
    lines.push('❌ UNRESOLVED DEPENDENCY');
  }

  lines.push('');

  if (info.modules.length > 0) {
    lines.push(`   Modules involved: ${info.modules.join(', ')}`);
  }
  if (info.providers.length > 0) {
    lines.push(`   Providers: ${info.providers.join(', ')}`);
  }

  lines.push('');
  lines.push('   💡 FIX:');
  for (const line of info.suggestion.split('\n')) {
    lines.push(`   ${line}`);
  }

  lines.push('');
  lines.push('   📖 Debug commands:');
  lines.push('     - Set NEST_DEBUG=true for the full dependency tree');
  lines.push('     - Run: npx nestjs-boot graph  (visualize module dependencies)');
  lines.push('     - Read: docs/guides/di-best-practices.md');
  lines.push('');

  return lines.join('\n');
}

// ── Internal helpers ────────────────────────────────────────────────

function extractModuleNames(msg: string): string[] {
  const names: string[] = [];

  // Pattern: "in the <ModuleName> context"
  const contextMatch = msg.match(/in the (\w+) context/i);
  if (contextMatch) names.push(contextMatch[1]);

  // Pattern: "<ModuleName> "imports" array"
  const importMatch = msg.match(/the (\w+) "imports"/i);
  if (importMatch && !names.includes(importMatch[1])) names.push(importMatch[1]);

  // Pattern: "Nest cannot create the <ModuleName> instance"
  const createMatch = msg.match(/cannot create the (\w+) instance/i);
  if (createMatch && !names.includes(createMatch[1])) names.push(createMatch[1]);

  return names;
}

function extractProviderNames(msg: string): string[] {
  const names: string[] = [];

  // Pattern: "dependencies of the <ProviderName>"
  const depMatch = msg.match(/dependencies of the (\w+)/i);
  if (depMatch) names.push(depMatch[1]);

  return names;
}

function extractMissingDep(msg: string): string | null {
  // Pattern: "the argument <DepName> at index [X]"
  const match = msg.match(/the argument (\w+) at index/i);
  if (match) return match[1];

  // Pattern: "the argument <DepName> (or <TokenName>)"
  const match2 = msg.match(/the argument (?:(\w+)|"([^"]+)")/i);
  if (match2) return match2[1] || match2[2];

  return null;
}

function buildCircularSuggestion(modules: string[], _providers: string[]): string {
  const lines: string[] = [];

  if (modules.length >= 2) {
    lines.push(`Use forwardRef() in ${modules[0]}'s imports:`);
    lines.push('');
    lines.push(`  @Module({`);
    lines.push(`    imports: [forwardRef(() => ${modules[1]})]`);
    lines.push(`  })`);
    lines.push(`  export class ${modules[0]} {}`);
  } else if (modules.length === 1) {
    lines.push(`Use forwardRef() when importing the other module in ${modules[0]}:`);
    lines.push('');
    lines.push(`  imports: [forwardRef(() => OtherModule)]`);
  } else {
    lines.push('Use forwardRef() on both sides of the circular import:');
    lines.push('');
    lines.push('  imports: [forwardRef(() => TheOtherModule)]');
  }

  lines.push('');
  lines.push('Or extract shared logic into a SharedModule that both can import.');

  return lines.join('\n');
}

function buildUnresolvedSuggestion(
  missingDep: string | null,
  modules: string[],
  _providers: string[],
): string {
  const lines: string[] = [];
  const dep = missingDep || 'the missing dependency';
  const mod = modules[0] || 'your module';

  lines.push(`Ensure ${dep} is provided and exported:`);
  lines.push('');
  lines.push('  1. Check that the module providing it is imported:');
  lines.push(`     @Module({ imports: [ModuleThatProvides${dep}] })`);
  lines.push(`     export class ${mod} {}`);
  lines.push('');
  lines.push(`  2. Check that ${dep} is in the providers AND exports of its module:`);
  lines.push(`     @Module({ providers: [${dep}], exports: [${dep}] })`);
  lines.push('');
  lines.push(`  3. If ${dep} is from a dynamic module, ensure .register()/.forRoot() is called`);

  return lines.join('\n');
}
