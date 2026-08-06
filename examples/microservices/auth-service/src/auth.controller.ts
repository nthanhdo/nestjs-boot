import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';

interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

interface ValidateTokenRequest {
  token: string;
}

interface RefreshTokenRequest {
  refreshToken: string;
}

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'Login')
  async login(data: LoginRequest) {
    return this.authService.login(data.email, data.password);
  }

  @GrpcMethod('AuthService', 'Register')
  async register(data: RegisterRequest) {
    const user = await this.authService.register(data.email, data.password, data.name);
    return { user };
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(data: ValidateTokenRequest) {
    return this.authService.validateToken(data.token);
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async refreshToken(data: RefreshTokenRequest) {
    return this.authService.refreshToken(data.refreshToken);
  }
}
