import type { ApiTestConfig, EndpointConfig, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export interface CrudConfig {
  basePath: string;
  createPayload: unknown;
  updatePayload: unknown;
  idField?: string;
}

export interface CrudTestCase extends TestCase {
  dependsOn?: string;
  extractId?: { field: string; as: string };
  injectId?: string;
}

export function generateCrudLifecycle(
  config: ApiTestConfig,
  crudConfig: CrudConfig,
): CrudTestCase[] {
  const { basePath, createPayload, updatePayload, idField = 'id' } = crudConfig;
  const cases: CrudTestCase[] = [];

  const baseEndpoint: EndpointConfig = { method: 'POST', path: basePath };
  const baseUrl = buildUrl(config, baseEndpoint);
  const headers = buildHeaders(config, baseEndpoint);

  // Step 1: POST create
  const createId = nextId('crud');
  cases.push({
    id: createId,
    name: `CRUD ${basePath} — 1. Create resource`,
    category: 'crud',
    description: `POST ${basePath} to create a new resource`,
    request: { method: 'POST', url: baseUrl, headers: { ...headers, 'Content-Type': 'application/json' }, body: createPayload },
    expect: { status: [200, 201] },
    mutation: 'Create new resource via POST',
    extractId: { field: idField, as: 'resourceId' },
  });

  // Step 2: GET by id
  const getId = nextId('crud');
  cases.push({
    id: getId,
    name: `CRUD ${basePath} — 2. Read created resource`,
    category: 'crud',
    description: `GET ${basePath}/:id to verify resource exists`,
    request: { method: 'GET', url: `${baseUrl}/:resourceId`, headers },
    expect: { status: 200 },
    mutation: 'Read resource by ID returned from create',
    dependsOn: createId,
    injectId: 'resourceId',
  });

  // Step 3: PUT update
  const putId = nextId('crud');
  cases.push({
    id: putId,
    name: `CRUD ${basePath} — 3. Update resource (PUT)`,
    category: 'crud',
    description: `PUT ${basePath}/:id to update resource`,
    request: { method: 'PUT', url: `${baseUrl}/:resourceId`, headers: { ...headers, 'Content-Type': 'application/json' }, body: updatePayload },
    expect: { status: 200 },
    mutation: 'Update resource via PUT with new payload',
    dependsOn: createId,
    injectId: 'resourceId',
  });

  // Step 4: PATCH update
  const patchId = nextId('crud');
  cases.push({
    id: patchId,
    name: `CRUD ${basePath} — 4. Partial update (PATCH)`,
    category: 'crud',
    description: `PATCH ${basePath}/:id to partially update resource`,
    request: { method: 'PATCH', url: `${baseUrl}/:resourceId`, headers: { ...headers, 'Content-Type': 'application/json' }, body: updatePayload },
    expect: { status: 200 },
    mutation: 'Partial update resource via PATCH',
    dependsOn: createId,
    injectId: 'resourceId',
  });

  // Step 5: DELETE
  const deleteId = nextId('crud');
  cases.push({
    id: deleteId,
    name: `CRUD ${basePath} — 5. Delete resource`,
    category: 'crud',
    description: `DELETE ${basePath}/:id to remove resource`,
    request: { method: 'DELETE', url: `${baseUrl}/:resourceId`, headers },
    expect: { status: [200, 204] },
    mutation: 'Delete resource by ID',
    dependsOn: createId,
    injectId: 'resourceId',
  });

  // Step 6: GET after delete -> 404
  cases.push({
    id: nextId('crud'),
    name: `CRUD ${basePath} — 6. Verify deleted (GET → 404)`,
    category: 'crud',
    description: `GET ${basePath}/:id after deletion should return 404`,
    request: { method: 'GET', url: `${baseUrl}/:resourceId`, headers },
    expect: { status: 404 },
    mutation: 'Verify resource no longer exists after DELETE',
    dependsOn: deleteId,
    injectId: 'resourceId',
  });

  // Step 7: DELETE again -> 404 (idempotent)
  cases.push({
    id: nextId('crud'),
    name: `CRUD ${basePath} — 7. Idempotent delete (DELETE → 404)`,
    category: 'crud',
    description: `DELETE ${basePath}/:id again should return 404`,
    request: { method: 'DELETE', url: `${baseUrl}/:resourceId`, headers },
    expect: { status: [404, 410] },
    mutation: 'Verify second DELETE returns 404 (idempotent)',
    dependsOn: deleteId,
    injectId: 'resourceId',
  });

  return cases;
}
