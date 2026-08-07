import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { CORRELATION_HEADER, CORRELATION_OPTIONS } from './constants';
import { correlationStorage } from './correlation.storage';

export interface CorrelationOptions {
  /** Header name to read/write correlation ID (default: 'X-Correlation-Id') */
  header?: string;
  /** Custom ID generator (default: crypto.randomUUID()) */
  generator?: () => string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly header: string;
  private readonly generator: () => string;

  constructor(
    @Optional()
    @Inject(CORRELATION_OPTIONS)
    options?: CorrelationOptions,
  ) {
    this.header = options?.header ?? CORRELATION_HEADER;
    this.generator = options?.generator ?? randomUUID;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const headerLower = this.header.toLowerCase();
    const incoming = req.headers[headerLower] as string | undefined;
    const correlationId = incoming || this.generator();

    // Extract W3C traceparent header for OTel trace continuation
    const traceparent = req.headers['traceparent'] as string | undefined;

    // Set on response header
    res.setHeader(this.header, correlationId);

    // Run the rest of the request inside AsyncLocalStorage context
    correlationStorage.run({ correlationId, traceparent }, () => {
      next();
    });
  }
}
