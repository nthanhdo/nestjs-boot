import type { FieldMeta, PayloadSchema } from './types.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\//;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;

function detectPattern(value: unknown): FieldMeta['pattern'] {
  if (typeof value !== 'string') return undefined;
  if (EMAIL_RE.test(value)) return 'email';
  if (UUID_RE.test(value)) return 'uuid';
  if (ISO_DATE_RE.test(value)) return 'iso-date';
  if (URL_RE.test(value)) return 'url';
  return undefined;
}

function detectType(value: unknown): FieldMeta['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  if (t === 'object') return 'object';
  return 'unknown';
}

function extractFields(obj: unknown, parentPath = '', required = true): FieldMeta[] {
  if (obj === null || obj === undefined || typeof obj !== 'object') return [];

  const fields: FieldMeta[] = [];
  const entries = Array.isArray(obj) ? [] : Object.entries(obj as Record<string, unknown>);

  for (const [key, value] of entries) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    const type = detectType(value);
    const pattern = detectPattern(value);

    fields.push({ name: key, path, type, pattern, required, value });

    if (type === 'object' && value !== null) {
      fields.push(...extractFields(value, path, required));
    }
    if (type === 'array' && Array.isArray(value) && value.length > 0) {
      // Analyze first item for array item schema
      const firstItem = value[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        fields.push(...extractFields(firstItem, `${path}[]`, false));
      }
    }
  }

  return fields;
}

export function analyzePayload(body: unknown): PayloadSchema | null {
  if (body === null || body === undefined) return null;
  if (typeof body !== 'object') return null;

  return {
    fields: extractFields(body),
    raw: body,
  };
}
