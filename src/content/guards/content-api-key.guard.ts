import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ContentApiKeyRepository } from '../repositories/content-api-key.repository';

@Injectable()
export class ContentApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyRepo: ContentApiKeyRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const keyHash = ContentApiKeyRepository.hashKey(apiKey);
    const keyRecord = await this.apiKeyRepo.findByHash(keyHash);

    if (!keyRecord) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach tenant and permissions to request for downstream use
    request.contentTenantId = keyRecord.tenantId;
    request.contentApiKeyPermissions = keyRecord.permissions;
    request.contentApiKeyEnvironment = keyRecord.environment;

    return true;
  }
}
