import { SetMetadata } from '@nestjs/common';

export const SUPERADMIN_ONLY_KEY = 'boot:superadminOnly';
export const SuperAdminOnly = () => SetMetadata(SUPERADMIN_ONLY_KEY, true);
