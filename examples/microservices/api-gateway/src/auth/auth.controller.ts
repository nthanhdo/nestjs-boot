import { Controller, Post, Body, Get, Headers } from '@nestjs/common';
import { AuthGateway } from './auth.gateway';

class LoginDto {
  email!: string;
  password!: string;
}

class RegisterDto {
  email!: string;
  password!: string;
  name!: string;
}

class RefreshTokenDto {
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authGateway: AuthGateway) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authGateway.login(dto.email, dto.password);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authGateway.register(dto.email, dto.password, dto.name);
  }

  @Get('validate')
  validate(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '') || '';
    return this.authGateway.validateToken(token);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authGateway.refreshToken(dto.refreshToken);
  }
}
