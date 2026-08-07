import { Inject, Injectable } from '@nestjs/common';
import type { Connection, ClientSession } from 'mongoose';

export const UNIT_OF_WORK_CONNECTION = 'BOOT_UNIT_OF_WORK_CONNECTION';

/**
 * Unit of Work for MongoDB transactions (multi-document).
 * Wraps multiple repository operations in a single session/transaction.
 *
 * Requires a MongoDB replica set (standalone MongoDB does not support transactions).
 *
 * Usage:
 * ```ts
 * const result = await this.unitOfWork.execute(async (session) => {
 *   const order = await this.orderRepo.create(data, { session });
 *   await this.inventoryRepo.decrement(productId, quantity, { session });
 *   await this.paymentRepo.charge(userId, total, { session });
 *   return order;
 * });
 * // All succeed or all rollback
 * ```
 */
@Injectable()
export class UnitOfWork {
  constructor(
    @Inject(UNIT_OF_WORK_CONNECTION) private readonly connection: Connection,
  ) {}

  /**
   * Execute a function within a MongoDB transaction.
   * Commits on success, aborts on error, always ends the session.
   */
  async execute<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
