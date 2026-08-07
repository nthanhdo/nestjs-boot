import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnitOfWork } from '../../src/database/unit-of-work';

function createMockSession() {
  return {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
  };
}

function createMockConnection(session = createMockSession()) {
  return {
    startSession: vi.fn().mockResolvedValue(session),
  };
}

describe('UnitOfWork', () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockConnection: ReturnType<typeof createMockConnection>;
  let uow: UnitOfWork;

  beforeEach(() => {
    mockSession = createMockSession();
    mockConnection = createMockConnection(mockSession);
    uow = new UnitOfWork(mockConnection as any);
  });

  it('should commit transaction on success', async () => {
    const result = await uow.execute(async (session) => {
      expect(session).toBe(mockSession);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(mockSession.startTransaction).toHaveBeenCalled();
    expect(mockSession.commitTransaction).toHaveBeenCalled();
    expect(mockSession.abortTransaction).not.toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalled();
  });

  it('should abort transaction on error and rethrow', async () => {
    const error = new Error('DB write failed');

    await expect(
      uow.execute(async () => {
        throw error;
      }),
    ).rejects.toThrow('DB write failed');

    expect(mockSession.abortTransaction).toHaveBeenCalled();
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalled();
  });

  it('should always end session even if abort fails', async () => {
    mockSession.abortTransaction.mockRejectedValue(new Error('abort fail'));

    await expect(
      uow.execute(async () => {
        throw new Error('original');
      }),
    ).rejects.toThrow();

    expect(mockSession.endSession).toHaveBeenCalled();
  });

  it('should pass session to the callback for use with repository operations', async () => {
    const operations: string[] = [];

    await uow.execute(async (session) => {
      operations.push('op1');
      operations.push('op2');
      // Verify session is available for passing to mongoose operations
      expect(session.startTransaction).toBeDefined();
    });

    expect(operations).toEqual(['op1', 'op2']);
    expect(mockSession.commitTransaction).toHaveBeenCalled();
  });
});
