import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';

let PrismaClientClass: any;
function getPrismaClient() {
  if (!PrismaClientClass) {
    try {
      PrismaClientClass = require('@prisma/client').PrismaClient;
    } catch {
      throw new Error(
        '@prisma/client is required for Prisma database driver. Install: npm i @prisma/client',
      );
    }
  }
  return PrismaClientClass;
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private _client: any;

  constructor(private readonly options?: { url?: string; log?: string[] }) {}

  get client(): any {
    if (!this._client) {
      const PClient = getPrismaClient();
      this._client = new PClient({
        datasources: this.options?.url ? { db: { url: this.options.url } } : undefined,
        log: this.options?.log ?? ['warn', 'error'],
      });
    }
    return this._client;
  }

  async onModuleInit() {
    await this.client.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  /** Run operations in a transaction */
  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.client.$transaction(fn);
  }
}
