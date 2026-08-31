import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from 'nestjs-boot';
import { BootJwtService, LoginTracker } from 'nestjs-boot';
import { AuditService } from 'nestjs-boot';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: BootJwtService,
    private readonly loginTracker: LoginTracker,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
        memberships: {
          include: { organization: true },
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.loginTracker.isLocked(dto.email)) {
      throw new UnauthorizedException('Account temporarily locked due to too many failed attempts');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      const locked = this.loginTracker.recordFailure(dto.email);
      if (locked) {
        throw new UnauthorizedException('Account locked due to too many failed attempts');
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    this.loginTracker.recordSuccess(dto.email);

    const membership = user.memberships?.[0];
    const roles = user.roles?.map((ur: any) => ur.role?.code).filter(Boolean) ?? [];
    const permissions = [
      ...new Set(
        user.roles?.flatMap((ur: any) =>
          ur.role?.permissions?.map((p: any) => p.code) ?? [],
        ) ?? [],
      ),
    ];

    const payload = {
      sub: user.id,
      email: user.email,
      roles,
      permissions,
      organizationId: membership?.organizationId ?? null,
      departmentId: membership?.departmentId ?? null,
      teamId: membership?.teamId ?? null,
    };

    const accessToken = this.jwt.sign(payload);
    const familyId = randomUUID();
    const refreshToken = this.jwt.signRefresh({ ...payload, familyId });

    await this.prisma.client.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        familyId,
        used: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await this.audit.logAccess(user.id, 'LOGIN', 'auth');

    return { accessToken, refreshToken };
  }

  async refreshToken(dto: RefreshTokenDto) {
    let decoded: any;
    try {
      decoded = this.jwt.verifyRefresh(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this.prisma.client.refreshToken.findFirst({
      where: { token: dto.refreshToken },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token not found');
    }

    if (stored.used) {
      // Possible token theft — revoke entire family
      await this.prisma.client.refreshToken.updateMany({
        where: { familyId: stored.familyId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token already used — possible token theft');
    }

    if (stored.revoked) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    // Mark old token as used
    await this.prisma.client.refreshToken.update({
      where: { id: stored.id },
      data: { used: true },
    });

    const { iat, exp, nbf, jti, ...payload } = decoded;
    const accessToken = this.jwt.sign(payload);
    const newRefreshToken = this.jwt.signRefresh(payload);

    await this.prisma.client.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: stored.userId,
        familyId: stored.familyId,
        used: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string) {
    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    await this.audit.logAccess(userId, 'LOGOUT', 'auth');

    return { message: 'Logged out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const resetToken = this.jwt.signPasswordReset(user.id);
    const resetUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;

    this.logger.warn(
      `[PASSWORD RESET] User: ${user.email} | Token: ${resetToken} | URL: ${resetUrl}`,
    );

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let decoded: { sub: string; purpose: string };
    try {
      decoded = this.jwt.verifyPasswordReset(dto.token);
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.client.user.update({
      where: { id: decoded.sub },
      data: { passwordHash },
    });

    // Revoke all refresh tokens
    await this.prisma.client.refreshToken.updateMany({
      where: { userId: decoded.sub },
      data: { revoked: true },
    });

    return { message: 'Password reset successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    return { message: 'Password changed successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: true },
            },
          },
        },
        memberships: {
          include: { organization: true },
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash, ...profile } = user;
    return profile;
  }
}
