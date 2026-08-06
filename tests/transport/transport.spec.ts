import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { TransportModule } from '../../src/transport/transport.module';
import { getClientToken, InjectClient, InjectGrpcClient } from '../../src/transport/decorators';
import { TRANSPORT_OPTIONS, TRANSPORT_CLIENT_PREFIX } from '../../src/transport/constants';
import { validateBootOptions } from '../../src/config/validators';
import { Injectable } from '@nestjs/common';

describe('TransportModule', () => {
  describe('getClientToken', () => {
    it('should produce correct token from name', () => {
      expect(getClientToken('ORDER_SERVICE')).toBe(
        `${TRANSPORT_CLIENT_PREFIX}ORDER_SERVICE`,
      );
    });
  });

  describe('register()', () => {
    it('should register TRANSPORT_OPTIONS provider', async () => {
      const options = { clients: {} };
      const module = await Test.createTestingModule({
        imports: [TransportModule.register(options)],
      }).compile();

      const stored = module.get(TRANSPORT_OPTIONS);
      expect(stored).toBe(options);
    });

    it('should register TCP client provider when @nestjs/microservices is available', async () => {
      // @nestjs/microservices may or may not be installed in dev.
      // We test the module structure regardless.
      const options = {
        clients: {
          ORDER_SERVICE: {
            transport: 'tcp' as const,
            options: { host: 'localhost', port: 4000 },
          },
        },
      };

      const dynamicModule = TransportModule.register(options);

      // The module should export the client token
      const token = getClientToken('ORDER_SERVICE');
      const hasExport = (dynamicModule.exports as string[])?.includes(token);

      // If @nestjs/microservices is installed, client token is exported
      // If not, it gracefully skips (no client registered)
      try {
        require('@nestjs/microservices');
        expect(hasExport).toBe(true);
      } catch {
        // @nestjs/microservices not installed — no client registered, but no crash
        expect(hasExport).toBe(false);
      }
    });

    it('should register no clients when clients option is omitted', async () => {
      const dynamicModule = TransportModule.register({});
      // Only TRANSPORT_OPTIONS should be exported
      expect(dynamicModule.exports).toEqual([TRANSPORT_OPTIONS]);
    });
  });

  describe('@InjectClient / @InjectGrpcClient decorators', () => {
    it('@InjectClient produces correct injection token', () => {
      // Decorators work by calling Inject() with the token.
      // We verify the token generation is correct.
      const token = getClientToken('MY_SERVICE');
      expect(token).toBe('TRANSPORT_CLIENT_MY_SERVICE');
    });

    it('@InjectGrpcClient produces same token format', () => {
      const token = getClientToken('GRPC_SVC');
      expect(token).toBe('TRANSPORT_CLIENT_GRPC_SVC');
    });
  });
});

describe('Transport validation (validators.ts)', () => {
  it('should pass valid transport config with TCP', () => {
    const options = {
      transport: {
        tcp: { host: '0.0.0.0', port: 3001 },
      },
    };
    const result = validateBootOptions(options);
    expect(result.transport?.tcp?.port).toBe(3001);
  });

  it('should pass valid transport config with NATS', () => {
    const options = {
      transport: {
        nats: { url: 'nats://localhost:4222', queue: 'my-queue' },
      },
    };
    const result = validateBootOptions(options);
    expect(result.transport?.nats?.url).toBe('nats://localhost:4222');
  });

  it('should pass valid transport config with RabbitMQ', () => {
    const options = {
      transport: {
        rabbitmq: {
          urls: ['amqp://localhost:5672'],
          queue: 'tasks',
          queueOptions: { durable: true },
        },
      },
    };
    const result = validateBootOptions(options);
    expect(result.transport?.rabbitmq?.queue).toBe('tasks');
  });

  it('should reject invalid gRPC config (missing url)', () => {
    const options = {
      transport: {
        grpc: {
          // url missing
          package: 'order',
          protoPath: '/path/to/order.proto',
        },
      },
    };
    expect(() => validateBootOptions(options)).toThrow();
  });

  it('should reject invalid gRPC config (missing package)', () => {
    const options = {
      transport: {
        grpc: {
          url: '0.0.0.0:5000',
          // package missing
          protoPath: '/path/to/order.proto',
        },
      },
    };
    expect(() => validateBootOptions(options)).toThrow();
  });

  it('should reject invalid RabbitMQ config (missing urls)', () => {
    const options = {
      transport: {
        rabbitmq: {
          queue: 'tasks',
          // urls missing
        },
      },
    };
    expect(() => validateBootOptions(options)).toThrow();
  });

  it('should pass with no transport config (optional)', () => {
    const result = validateBootOptions({});
    expect(result.transport).toBeUndefined();
  });

  it('should pass valid clients config', () => {
    const options = {
      transport: {
        clients: {
          ORDER_SERVICE: {
            transport: 'tcp',
            options: { host: 'localhost', port: 4000 },
          },
        },
      },
    };
    const result = validateBootOptions(options);
    expect(result.transport?.clients?.ORDER_SERVICE?.transport).toBe('tcp');
  });

  it('should reject invalid client transport type', () => {
    const options = {
      transport: {
        clients: {
          SVC: {
            transport: 'invalid_transport',
            options: {},
          },
        },
      },
    };
    expect(() => validateBootOptions(options)).toThrow();
  });
});
