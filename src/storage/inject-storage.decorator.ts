import { Inject } from '@nestjs/common';
import { STORAGE_ADAPTER } from './storage.constants';

/**
 * @InjectStorage() — inject the StorageService into your class.
 *
 * ```ts
 * constructor(@InjectStorage() private readonly storage: StorageService) {}
 * ```
 */
export const InjectStorage = () => Inject(STORAGE_ADAPTER);
