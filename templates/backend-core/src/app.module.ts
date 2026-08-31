import { Module } from '@nestjs/common';
import {
  ScopeModule,
  PolicyModule,
  AuditModule,
  AccessScope,
} from 'nestjs-boot';

// App modules
import { UserAuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AppAuditModule } from './audit/app-audit.module';
import { BUILT_IN_POLICIES } from './policies';

/**
 * AppModule — application-level concerns only.
 *
 * Infrastructure (database, auth, logging, swagger, versioning, correlation,
 * shutdown) is wired automatically by createApp() in main.ts via BootOptions.
 * Only app-specific modules and policy/scope configuration belong here.
 */
@Module({
  imports: [
    // ── Authorization (app-level policy) ──
    ScopeModule.register({
      defaultScope: AccessScope.OWN,
      resolveScope: (req) => {
        const roles: string[] = req.user?.roles ?? [];
        if (roles.includes('SUPER_ADMIN')) return AccessScope.SYSTEM;
        if (roles.includes('ADMIN')) return AccessScope.ORGANIZATION;
        if (roles.includes('MANAGER')) return AccessScope.DEPARTMENT;
        if (roles.includes('MODERATOR') || roles.includes('LEADER')) return AccessScope.TEAM;
        return AccessScope.OWN;
      },
    }),
    PolicyModule.register({
      policies: BUILT_IN_POLICIES,
      denyByDefault: true,
    }),
    AuditModule.register({
      logDenials: true,
    }),

    // ── Application Modules ──
    UserAuthModule,
    UsersModule,
    RolesModule,
    OrganizationsModule,
    AppAuditModule,
  ],
})
export class AppModule {}
