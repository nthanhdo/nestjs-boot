/**
 * gRPC status codes (mirroring grpc-js without requiring the dependency).
 * @see https://grpc.github.io/grpc/core/md_doc_statuscodes.html
 */
export enum GrpcStatus {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16,
}

const httpToGrpc: Record<number, GrpcStatus> = {
  200: GrpcStatus.OK,
  400: GrpcStatus.INVALID_ARGUMENT,
  401: GrpcStatus.UNAUTHENTICATED,
  403: GrpcStatus.PERMISSION_DENIED,
  404: GrpcStatus.NOT_FOUND,
  408: GrpcStatus.DEADLINE_EXCEEDED,
  409: GrpcStatus.ALREADY_EXISTS,
  412: GrpcStatus.FAILED_PRECONDITION,
  416: GrpcStatus.OUT_OF_RANGE,
  422: GrpcStatus.INVALID_ARGUMENT,
  429: GrpcStatus.RESOURCE_EXHAUSTED,
  499: GrpcStatus.CANCELLED,
  500: GrpcStatus.INTERNAL,
  501: GrpcStatus.UNIMPLEMENTED,
  503: GrpcStatus.UNAVAILABLE,
};

const grpcToHttp: Record<number, number> = {
  [GrpcStatus.OK]: 200,
  [GrpcStatus.CANCELLED]: 499,
  [GrpcStatus.UNKNOWN]: 500,
  [GrpcStatus.INVALID_ARGUMENT]: 400,
  [GrpcStatus.DEADLINE_EXCEEDED]: 408,
  [GrpcStatus.NOT_FOUND]: 404,
  [GrpcStatus.ALREADY_EXISTS]: 409,
  [GrpcStatus.PERMISSION_DENIED]: 403,
  [GrpcStatus.RESOURCE_EXHAUSTED]: 429,
  [GrpcStatus.FAILED_PRECONDITION]: 412,
  [GrpcStatus.ABORTED]: 409,
  [GrpcStatus.OUT_OF_RANGE]: 416,
  [GrpcStatus.UNIMPLEMENTED]: 501,
  [GrpcStatus.INTERNAL]: 500,
  [GrpcStatus.UNAVAILABLE]: 503,
  [GrpcStatus.DATA_LOSS]: 500,
  [GrpcStatus.UNAUTHENTICATED]: 401,
};

/**
 * Convert an HTTP status code to the closest gRPC status code.
 * Unknown HTTP codes default to INTERNAL (13).
 */
export function httpStatusToGrpc(httpStatus: number): GrpcStatus {
  return httpToGrpc[httpStatus] ?? GrpcStatus.INTERNAL;
}

/**
 * Convert a gRPC status code to the closest HTTP status code.
 * Unknown gRPC codes default to 500.
 */
export function grpcStatusToHttp(grpcStatus: number): number {
  return grpcToHttp[grpcStatus] ?? 500;
}
