import { Module } from '@nestjs/common';
import {
  AuthModule,
  MultiSchemaModule,
  ScopeModule,
  PolicyModule,
  AuditModule,
  CorrelationModule,
  ShutdownModule,
  LoggingModule,
  VersioningModule,
  SwaggerModule,
  AccessScope,
} from 'nestjs-boot';

// App modules
import { UserAuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AppAuditModule } from './audit/app-audit.module';
import { BUILT_IN_POLICIES } from './policies';

@Module({
  imports: [
    // ── Infrastructure ──
    MultiSchemaModule.register({
      url: process.env.DATABASE_URL,
      autoCreateSchemas: true,
    }),
    CorrelationModule.register(),
    LoggingModule.register({ level: process.env.LOG_LEVEL ?? 'info' }),
    ShutdownModule.register({ timeout: 10000 }),
    SwaggerModule.register({
      enabled: process.env.NODE_ENV !== 'production',
      path: '/api/docs',
    }),
    VersioningModule.register({ type: 'uri', defaultVersion: '1' }),

    // ── Auth & Authorization ──
    AuthModule.register({
      jwt: {
        secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production-32ch',
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '1h' },
        refreshSecret:
          process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-32chars',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      },
      rbac: {
        enabled: true,
        denyByDefault: true,
        superAdmin: 'SUPER_ADMIN',
        hierarchy: [
          { name: 'SUPER_ADMIN', inherits: ['ADMIN'] },
          { name: 'ADMIN', inherits: ['MANAGER'] },
          { name: 'MANAGER', inherits: ['MODERATOR'] },
          { name: 'MODERATOR', inherits: ['LEADER'] },
          { name: 'LEADER', inherits: ['STAFF'] },
          { name: 'STAFF', inherits: ['USER'] },
          { name: 'USER' },
        ],
      },
      loginTracker: {
        maxAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
      },
    }),
    ScopeModule.register({
      defaultScope: AccessScope.OWN,
      resolveScope: (req) => {
        // Map user roles to access scopes
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
