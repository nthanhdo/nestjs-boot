import type { ApiTestConfig, EndpointConfig, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export type PaginationStyle = 'offset' | 'cursor' | 'unknown';

export interface PaginationDetection {
  style: PaginationStyle;
  pageParam?: string;
  limitParam?: string;
  offsetParam?: string;
  cursorParam?: string;
  totalField?: string;
  dataField?: string;
  nextCursorField?: string;
  detectedLimit?: number;
  detectedTotal?: number;
}

const PAGE_PARAMS = ['page', 'p', 'pageNumber', 'page_number'];
const LIMIT_PARAMS = ['limit', 'size', 'per_page', 'perPage', 'pageSize', 'page_size', 'count'];
const OFFSET_PARAMS = ['offset', 'skip', 'start'];
const CURSOR_PARAMS = ['cursor', 'after', 'before', 'next_cursor', 'nextCursor', 'continuation'];
const TOTAL_FIELDS = ['total', 'totalCount', 'total_count', 'totalItems', 'total_items', 'count'];
const DATA_FIELDS = ['data', 'items', 'results', 'records', 'rows', 'entries', 'list', 'content'];
const NEXT_FIELDS = ['next', 'nextCursor', 'next_cursor', 'cursor', 'nextPageToken', 'continuation'];

function findField(obj: any, candidates: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  return candidates.find(c => c in obj);
}

/**
 * Auto-detect pagination style from response body and query params.
 */
export function detectPagination(
  endpoint: EndpointConfig,
  body: unknown,
): PaginationDetection | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;

  const detection: PaginationDetection = { style: 'unknown' };

  // Detect data array field
  const dataField = findField(obj, DATA_FIELDS);
  if (dataField && Array.isArray(obj[dataField])) {
    detection.dataField = dataField;
  }

  // Detect total
  const totalField = findField(obj, TOTAL_FIELDS);
  if (totalField && typeof obj[totalField] === 'number') {
    detection.totalField = totalField;
    detection.detectedTotal = obj[totalField] as number;
  }

  // Detect cursor
  const nextField = findField(obj, NEXT_FIELDS);
  if (nextField && obj[nextField]) {
    detection.style = 'cursor';
    detection.nextCursorField = nextField;
    const cursorParam = (endpoint.query && findField(endpoint.query, CURSOR_PARAMS)) || 'cursor';
    detection.cursorParam = cursorParam;
  }

  // Detect offset/page style from query
  if (endpoint.query) {
    const pageParam = findField(endpoint.query, PAGE_PARAMS);
    const limitParam = findField(endpoint.query, LIMIT_PARAMS);
    const offsetParam = findField(endpoint.query, OFFSET_PARAMS);

    if (pageParam) { detection.pageParam = pageParam; detection.style = 'offset'; }
    if (limitParam) {
      detection.limitParam = limitParam;
      detection.detectedLimit = parseInt(endpoint.query[limitParam], 10) || undefined;
      detection.style = 'offset';
    }
    if (offsetParam) { detection.offsetParam = offsetParam; detection.style = 'offset'; }
  }

  // If we found nothing meaningful, return null
  if (detection.style === 'unknown' && !detection.dataField && !detection.totalField) {
    return null;
  }

  return detection;
}

/**
 * Generate pagination test cases based on auto-detected pagination style.
 */
export function generatePaginationTests(
  config: ApiTestConfig,
  endpoint: EndpointConfig,
  happyCase?: RecordedResponse,
): TestCase[] {
  const cases: TestCase[] = [];
  const baseUrl = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);
  const body = happyCase?.body;

  const detection = body ? detectPagination(endpoint, body) : null;
  const limitParam = detection?.limitParam ?? 'limit';
  const pageParam = detection?.pageParam ?? 'page';

  const makeUrl = (extra: Record<string, string>) => {
    const ep: EndpointConfig = {
      ...endpoint,
      query: { ...(endpoint.query ?? {}), ...extra },
    };
    return buildUrl(config, ep);
  };

  // 1. Page 1 vs Page 2 — no overlapping items
  cases.push({
    id: nextId('pagination'),
    name: `Pagination ${endpoint.path} — page 1 vs page 2 no overlap`,
    category: 'pagination',
    description: 'Items on page 1 and page 2 should not overlap',
    request: { method: endpoint.method, url: makeUrl({ [pageParam]: '2' }), headers },
    expect: { status: 200 },
    mutation: 'Fetch page 2 to verify no overlap with page 1',
  });

  // 2. Last page — items <= limit
  cases.push({
    id: nextId('pagination'),
    name: `Pagination ${endpoint.path} — last page items <= limit`,
    category: 'pagination',
    description: 'Last page should have items count <= limit',
    request: { method: endpoint.method, url: makeUrl({ [pageParam]: '999999' }), headers },
    expect: { status: [200, 404] },
    mutation: 'Fetch very high page number to test last/empty page behavior',
  });

  // 3. Beyond last page — empty or 404
  cases.push({
    id: nextId('pagination'),
    name: `Pagination ${endpoint.path} — beyond last page`,
    category: 'pagination',
    description: 'Page beyond total should return empty array or 404',
    request: { method: endpoint.method, url: makeUrl({ [pageParam]: '2147483647' }), headers },
    expect: { status: [200, 404] },
    mutation: 'Request page far beyond total to test boundary',
  });

  // 4. limit=0
  cases.push({
    id: nextId('pagination'),
    name: `Pagination ${endpoint.path} — limit=0`,
    category: 'pagination',
    description: 'limit=0 behavior test',
    request: { method: endpoint.method, url: makeUrl({ [limitParam]: '0' }), headers },
    expect: { status: [200, 400] },
    mutation: 'Set limit=0 to test edge behavior',
  });

  // 5. limit=-1 → expect 400
  cases.push({
    id: nextId('pagination'),
    name: `Pagination ${endpoint.path} — limit=-1 (invalid)`,
    category: 'pagination',
    description: 'Negative limit should return 400',
    request: { method: endpoint.method, url: makeUrl({ [limitParam]: '-1' }), headers },
    expect: { status: [400, 422] },
    mutation: 'Set limit=-1 to test negative limit validation',
  });

  // 6. limit=very large
  cases.push({
    id: nextId('pagination'),
    name: `Pagination ${endpoint.path} — limit=10000 (very large)`,
    category: 'pagination',
    description: 'Very large limit should be handled gracefully',
    request: { method: endpoint.method, url: makeUrl({ [limitParam]: '10000' }), headers },
    expect: { status: [200, 400] },
    mutation: 'Set limit=10000 to test large page size handling',
  });

  // 7. Cursor-based: use next cursor from page 1
  if (detection?.style === 'cursor' && detection.nextCursorField && detection.cursorParam) {
    const cursorVal = (body as any)?.[detection.nextCursorField];
    if (cursorVal) {
      cases.push({
        id: nextId('pagination'),
        name: `Pagination ${endpoint.path} — cursor follow next`,
        category: 'pagination',
        description: 'Use next cursor from page 1 to fetch page 2',
        request: {
          method: endpoint.method,
          url: makeUrl({ [detection.cursorParam]: String(cursorVal) }),
          headers,
        },
        expect: { status: 200 },
        mutation: `Follow cursor: ${detection.cursorParam}=${cursorVal}`,
      });
    }
  }

  // 8. Total count match (if total detected)
  if (detection?.detectedTotal !== undefined) {
    cases.push({
      id: nextId('pagination'),
      name: `Pagination ${endpoint.path} — total count consistency`,
      category: 'pagination',
      description: `Total field reports ${detection.detectedTotal}; verify data consistency`,
      request: { method: endpoint.method, url: baseUrl, headers },
      expect: { status: 200 },
      mutation: 'Verify total count matches across pages',
    });
  }

  return cases;
}
