import { describe, it, expect } from 'vitest';
import {
  GrpcStatus,
  httpStatusToGrpc,
  grpcStatusToHttp,
} from '../../src/rpc/grpc-status-map';

describe('grpc-status-map', () => {
  describe('httpStatusToGrpc', () => {
    it.each([
      [200, GrpcStatus.OK],
      [400, GrpcStatus.INVALID_ARGUMENT],
      [401, GrpcStatus.UNAUTHENTICATED],
      [403, GrpcStatus.PERMISSION_DENIED],
      [404, GrpcStatus.NOT_FOUND],
      [409, GrpcStatus.ALREADY_EXISTS],
      [429, GrpcStatus.RESOURCE_EXHAUSTED],
      [500, GrpcStatus.INTERNAL],
      [501, GrpcStatus.UNIMPLEMENTED],
      [503, GrpcStatus.UNAVAILABLE],
    ])('maps HTTP %d → gRPC %d', (http, grpc) => {
      expect(httpStatusToGrpc(http)).toBe(grpc);
    });

    it('maps unknown HTTP codes to INTERNAL', () => {
      expect(httpStatusToGrpc(418)).toBe(GrpcStatus.INTERNAL);
      expect(httpStatusToGrpc(999)).toBe(GrpcStatus.INTERNAL);
    });
  });

  describe('grpcStatusToHttp', () => {
    it.each([
      [GrpcStatus.OK, 200],
      [GrpcStatus.INVALID_ARGUMENT, 400],
      [GrpcStatus.NOT_FOUND, 404],
      [GrpcStatus.UNAUTHENTICATED, 401],
      [GrpcStatus.PERMISSION_DENIED, 403],
      [GrpcStatus.INTERNAL, 500],
      [GrpcStatus.UNAVAILABLE, 503],
    ])('maps gRPC %d → HTTP %d', (grpc, http) => {
      expect(grpcStatusToHttp(grpc)).toBe(http);
    });

    it('maps unknown gRPC codes to 500', () => {
      expect(grpcStatusToHttp(99)).toBe(500);
      expect(grpcStatusToHttp(-1)).toBe(500);
    });
  });
});
