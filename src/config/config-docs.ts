import * as Joi from 'joi';

/**
 * A single documented config option extracted from a Joi schema.
 */
export interface ConfigDocEntry {
  path: string;
  type: string;
  required: boolean;
  defaultValue: string | undefined;
  description: string;
  allowedValues?: string[];
}

/**
 * Walk a Joi schema description tree and extract all leaf nodes
 * as flat ConfigDocEntry records.
 */
// Joi.Description.flags is typed as {} — cast to access runtime keys safely
type JoiFlags = Record<string, unknown>;

function getFlags(desc: Joi.Description): JoiFlags {
  return (desc.flags ?? {}) as JoiFlags;
}

function walkSchema(
  description: Joi.Description,
  prefix: string,
  entries: ConfigDocEntry[],
): void {
  const type = description.type ?? 'any';

  if (type === 'object' && description.keys) {
    for (const [key, childDesc] of Object.entries(description.keys)) {
      walkSchema(childDesc as Joi.Description, prefix ? `${prefix}.${key}` : key, entries);
    }
    return;
  }

  if (type === 'alternatives' && description.matches) {
    // For alternatives (e.g. string | number), just show the path as 'string | number'
    const types = (description.matches as any[])
      .map((m: any) => m?.schema?.type ?? '?')
      .join(' | ');
    const flags = getFlags(description);
    entries.push({
      path: prefix,
      type: types,
      required: !flags['presence'] || flags['presence'] === 'required',
      defaultValue: formatDefault(description),
      description: extractDescription(description),
      allowedValues: extractAllowed(description),
    });
    return;
  }

  const flags = getFlags(description);
  entries.push({
    path: prefix,
    type,
    required: flags['presence'] === 'required',
    defaultValue: formatDefault(description),
    description: extractDescription(description),
    allowedValues: extractAllowed(description),
  });
}

function formatDefault(desc: Joi.Description): string | undefined {
  const flags = getFlags(desc);
  const def = flags['default'];
  if (def === undefined) return undefined;
  if (typeof def === 'function') return '<dynamic>';
  return JSON.stringify(def);
}

function extractDescription(desc: Joi.Description): string {
  // Joi stores notes / labels in various places
  const flags = getFlags(desc);
  const label = flags['label'] as string | undefined;
  const notes = (desc.notes ?? []).join(' ');
  return label ?? notes ?? '';
}

function extractAllowed(desc: Joi.Description): string[] | undefined {
  const allow = desc.allow ?? desc.valids ?? [];
  if (Array.isArray(allow) && allow.length > 0) {
    return allow.map((v: unknown) => JSON.stringify(v));
  }
  return undefined;
}

/**
 * Generate a Markdown documentation table for all config options
 * defined in a Joi schema.
 *
 * Used by the CLI command: `npx nestjs-boot config:docs`
 *
 * ```ts
 * import { bootOptionsSchema } from './validators';
 * import { generateConfigDocs } from './config-docs';
 *
 * const markdown = generateConfigDocs(bootOptionsSchema);
 * process.stdout.write(markdown);
 * ```
 *
 * Output format:
 * ```markdown
 * # nestjs-boot Config Reference
 *
 * | Path | Type | Required | Default | Allowed Values | Description |
 * |------|------|----------|---------|----------------|-------------|
 * | database.connections.master.writerUri | string | ✅ | — | — | ... |
 * ```
 */
export function generateConfigDocs(schema: Joi.Schema): string {
  const description = schema.describe();
  const entries: ConfigDocEntry[] = [];
  walkSchema(description, '', entries);

  const lines: string[] = [
    '# nestjs-boot Config Reference',
    '',
    'Auto-generated from the Joi validation schema. Do not edit manually.',
    '',
    '| Path | Type | Required | Default | Allowed Values | Description |',
    '|------|------|----------|---------|----------------|-------------|',
  ];

  for (const entry of entries) {
    const path = `\`${entry.path}\``;
    const type = `\`${entry.type}\``;
    const required = entry.required ? '✅ yes' : 'no';
    const defaultVal = entry.defaultValue ?? '—';
    const allowed =
      entry.allowedValues && entry.allowedValues.length > 0
        ? entry.allowedValues.join(', ')
        : '—';
    const description = entry.description || '—';

    lines.push(`| ${path} | ${type} | ${required} | ${defaultVal} | ${allowed} | ${description} |`);
  }

  lines.push('');
  lines.push(`*Generated at: ${new Date().toISOString()}*`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Write config docs to stdout.
 * Suitable for use as a CLI entry point.
 *
 * ```bash
 * npx ts-node -e "require('./src/config/config-docs').printConfigDocs(require('./src/config/validators').bootOptionsSchema)"
 * ```
 */
export function printConfigDocs(schema: Joi.Schema): void {
  process.stdout.write(generateConfigDocs(schema));
}
