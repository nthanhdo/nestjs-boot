import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import { ServiceClient } from '../../src/transport/service-client';
import { runWithCorrelationId } from '../../src/correlation/correlation.storage';
import { runWithAuthContext } from '../../src/inter-service-auth/auth-context.storage';

interface TestService {
  getOrder(data: { id: string }): { id: string; name: string };
}

describe('ServiceClient', () => {
  it('auto-injects correlationId into __metadata', async () => {
    const send = vi.fn().mockReturnValue(of({ id: '1', name: 'Order' }));
    const client = new ServiceClient<TestService>({ send });

    await runWithCorrelationId('corr-123', () =>
      client.call('getOrder', { id: '1' }),
    );

    const payload = send.mock.calls[0][1];
    expect(payload.__metadata.correlationId).toBe('corr-123');
  });

  it('auto-forwards auth token from ALS context into __metadata', async () => {
    const send = vi.fn().mockReturnValue(of({ id: '1', name: 'Order' }));
    const client = new ServiceClient<TestService>({ send });

    await runWithAuthContext({ token: 'Bearer jwt-token-123' }, () =>
      runWithCorrelationId('corr-456', () =>
        client.call('getOrder', { id: '1' }),
      ),
    );

    const payload = send.mock.calls[0][1];
    expect(payload.__metadata.authorization).toBe('Bearer jwt-token-123');
    expect(payload.__metadata.correlationId).toBe('corr-456');
  });

  it('auto-forwards apiKey from ALS context into __metadata', async () => {
    const send = vi.fn().mockReturnValue(of({ id: '1', name: 'Order' }));
    const client = new ServiceClient<TestService>({ send });

    await runWithAuthContext({ apiKey: 'sk-secret' }, () =>
      client.call('getOrder', { id: '1' }),
    );

    const payload = send.mock.calls[0][1];
    expect(payload.__metadata.apiKey).toBe('sk-secret');
  });

  it('works without auth context (no crash)', async () => {
    const send = vi.fn().mockReturnValue(of({ id: '1', name: 'Order' }));
    const client = new ServiceClient<TestService>({ send });

    const result = await client.call('getOrder', { id: '1' });

    expect(result).toEqual({ id: '1', name: 'Order' });
    // No __metadata when no correlation or auth
    const payload = send.mock.calls[0][1];
    expect(payload.__metadata).toBeUndefined();
  });
});
