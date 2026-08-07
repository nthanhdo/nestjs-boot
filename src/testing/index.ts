// Contract testing helpers
export {
  createMockGrpcService,
  ContractVerifier,
} from './contract';
export type {
  ResponseFactory,
  ServiceDefinition,
  SchemaLike,
  ContractMethod,
  ContractDefinition,
  VerificationResult,
} from './contract';

// Integration testing helpers
export {
  createTestApp,
  seedDatabase,
  cleanDatabase,
} from './integration';
export type { TestAppContext, CreateTestAppOptions } from './integration';

// Test suite (auto-isolation)
export { createTestSuite } from './integration/test-suite';
export type { TestSuite } from './integration/test-suite';

// Factory helpers
export { createFactory } from './factories';
export type { TestFactory, FactoryOptions } from './factories';

// HTTP test client
export { createTestClient } from './http';
export type { TestClient, TestResponse } from './http';

// gRPC test client
export { createGrpcTestClient } from './grpc';
export type { GrpcTestClient } from './grpc';

// Microservice message dispatcher
export { createMessageDispatcher } from './microservice';
export type { MessageDispatcher } from './microservice';

// Snapshot testing
export { expectSnapshot, stripVolatileFields } from './snapshot';
export type { SnapshotOptions } from './snapshot';

// Auth testing helpers
export {
  createTestJwt,
  createTestApiKey,
  createAuthenticatedRequest,
  MockAuthModule,
  TEST_SECRET,
} from './auth';
export type { CreateTestJwtOptions } from './auth';
