import { Injectable, Inject, NotFoundException, Optional } from '@nestjs/common';
import { ContentAssetRepository } from '../repositories/content-asset.repository';
import type { IContentAsset, ContentPaginatedResult } from '../interfaces';

/** Minimal StorageService interface to avoid hard dep */
interface StorageServiceLike {
  upload(key: string, buffer: Buffer, contentType?: string): Promise<{ key: string; url?: string }>;
  delete(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresIn?: number): Promise<string>;
}

const STORAGE_SERVICE_TOKEN = 'BOOT_STORAGE_SERVICE';

@Injectable()
export class ContentAssetService {
  constructor(
    private readonly assetRepo: ContentAssetRepository,
    @Optional() @Inject(STORAGE_SERVICE_TOKEN) private readonly storage?: StorageServiceLike,
  ) {}

  async upload(data: {
    filename: string;
    mimeType: string;
    size: number;
    buffer: Buffer;
    folder?: string;
    tags?: string[];
    altText?: Record<string, string>;
    tenantId?: string;
  }): Promise<IContentAsset> {
    const storageKey = `content/${data.tenantId ?? 'default'}/${data.folder ?? 'uploads'}/${Date.now()}-${data.filename}`;

    if (this.storage) {
      await this.storage.upload(storageKey, data.buffer, data.mimeType);
    }

    return this.assetRepo.create({
      filename: data.filename,
      mimeType: data.mimeType,
      size: data.size,
      storageKey,
      folder: data.folder,
      tags: data.tags,
      altText: data.altText,
      tenantId: data.tenantId,
    });
  }

  async findById(id: string, tenantId?: string): Promise<IContentAsset> {
    const asset = await this.assetRepo.findById(id, tenantId);
    if (!asset) throw new NotFoundException(`Asset "${id}" not found`);
    return asset;
  }

  async findAll(
    filters: { tenantId?: string; folder?: string; mimeType?: string; tags?: string[] },
    page?: number,
    pageSize?: number,
  ): Promise<ContentPaginatedResult<IContentAsset>> {
    return this.assetRepo.findAll(filters, page, pageSize);
  }

  async update(
    id: string,
    data: Partial<Pick<IContentAsset, 'filename' | 'folder' | 'tags' | 'altText'>>,
    tenantId?: string,
  ): Promise<IContentAsset> {
    await this.findById(id, tenantId);
    return this.assetRepo.update(id, data);
  }

  async delete(id: string, tenantId?: string): Promise<void> {
    const asset = await this.findById(id, tenantId);
    if (this.storage) {
      await this.storage.delete(asset.storageKey);
    }
    await this.assetRepo.delete(id);
  }

  async distinctFolders(tenantId?: string): Promise<string[]> {
    return this.assetRepo.distinctFolders(tenantId);
  }

  async distinctTags(tenantId?: string): Promise<string[]> {
    return this.assetRepo.distinctTags(tenantId);
  }

  async getSignedUrl(id: string, tenantId?: string, expiresIn = 3600): Promise<string | null> {
    const asset = await this.findById(id, tenantId);
    if (this.storage?.getSignedUrl) {
      return this.storage.getSignedUrl(asset.storageKey, expiresIn);
    }
    return null;
  }
}
