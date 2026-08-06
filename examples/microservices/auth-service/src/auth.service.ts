import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BootJwtService } from 'nestjs-boot';
import * as bcrypt from 'bcrypt';
import { UserDocument } from './schemas/user.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
    private readonly jwt: BootJwtService,
  ) {}

  async register(email: string, password: string, name: string) {
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) {
      throw new UnauthorizedException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.userModel.create({ email, passwordHash, name });
    this.logger.log(`User registered: ${user._id} ${email}`);

    return {
      id: user._id!.toString(),
      email: user.email,
      name: user.name,
      roles: user.roles,
    };
  }

  async login(email: string, password: string) {
    const user = await this.userModel.findOne({ email }).exec();
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user._id!.toString(), email: user.email, roles: user.roles };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.signRefresh({ sub: user._id!.toString() });

    // Store refresh token
    user.refreshToken = refreshToken;
    await user.save();

    this.logger.log(`User logged in: ${user._id} ${email}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id!.toString(),
        email: user.email,
        name: user.name,
        roles: user.roles,
      },
    };
  }

  async validateToken(token: string) {
    try {
      const decoded = this.jwt.verify(token);
      return {
        valid: true,
        userId: decoded.sub as string,
        roles: (decoded.roles as string[]) || [],
      };
    } catch {
      return { valid: false, userId: '', roles: [] };
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded = this.jwt.verifyRefresh(refreshToken);
      const userId = decoded.sub as string;

      const user = await this.userModel.findById(userId).exec();
      if (!user || user.refreshToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const payload = { sub: user._id!.toString(), email: user.email, roles: user.roles };
      const newAccessToken = this.jwt.sign(payload);
      const newRefreshToken = this.jwt.signRefresh({ sub: user._id!.toString() });

      user.refreshToken = newRefreshToken;
      await user.save();

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user._id!.toString(),
          email: user.email,
          name: user.name,
          roles: user.roles,
        },
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
