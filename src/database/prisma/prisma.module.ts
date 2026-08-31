import { DynamicModule, Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export const PRISMA_SERVICE = 'BOOT_PRISMA_SERVICE';

export interface PrismaModuleOptions {
  url?: string;
  log?: string[];
}

@Global()
@Module({})
export class PrismaModule {
  static register(options?: PrismaModuleOptions): DynamicModule {
    return {
      module: PrismaModule,
      global: true,
      providers: [
        {
          provide: PRISMA_SERVICE,
          useFactory: () => new PrismaService(options),
        },
        {
          provide: PrismaService,
          useExisting: PRISMA_SERVICE,
        },
      ],
      exports: [PRISMA_SERVICE, PrismaService],
    };
  }
}
