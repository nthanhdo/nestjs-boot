// ============================================================
// LESSON 7: Authentication Endpoints
// ============================================================
//
// Authentication = "Who are you?" (prove your identity)
// Authorization = "What can you do?" (check permissions)
//
// This controller handles the authentication part:
//   POST /auth/register  -- create a new account
//   POST /auth/login     -- get a JWT token
//   POST /auth/refresh   -- get a new token using refresh token
//   GET  /auth/me        -- get current user info (requires token)
//
// HOW JWT AUTH WORKS (the flow):
//   1. Client sends email + password to POST /auth/login
//   2. Server verifies credentials, returns { accessToken, refreshToken }
//   3. Client stores tokens (localStorage, cookie, etc.)
//   4. Client sends accessToken in every request:
//      Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
//   5. nestjs-boot's JwtAuthGuard intercepts the request,
//      verifies the token, and attaches the decoded payload
//      to request.user
//   6. When accessToken expires (15 min), client sends
//      refreshToken to POST /auth/refresh to get a new pair
//
// NESTJS-BOOT CONNECTION:
// @Public() endpoints skip the JwtAuthGuard.
// Without @Public(), the guard rejects unauthenticated requests
// with 401 Unauthorized.
// ============================================================

import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from 'nestjs-boot';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // --------------------------------------------------------
  // POST /auth/register -- Create a new user account
  //
  // @Public() because you can't require a token to create
  // the first account! Registration is always public.
  //
  // TRY IT:
  //   curl -X POST http://localhost:3000/auth/register \
  //     -H "Content-Type: application/json" \
  //     -d '{"email":"alice@example.com","password":"secret123","name":"Alice"}'
  // --------------------------------------------------------
  @Public()
  @Post('register')
  async register(
    @Body() body: { email: string; password: string; name: string },
  ) {
    return this.authService.register(body.email, body.password, body.name);
  }

  // --------------------------------------------------------
  // POST /auth/login -- Authenticate and get tokens
  //
  // Returns: { accessToken, refreshToken, user }
  //
  // TRY IT:
  //   curl -X POST http://localhost:3000/auth/login \
  //     -H "Content-Type: application/json" \
  //     -d '{"email":"alice@example.com","password":"secret123"}'
  //
  // Copy the accessToken from the response, then use it:
  //   curl http://localhost:3000/auth/me \
  //     -H "Authorization: Bearer <paste-token-here>"
  // --------------------------------------------------------
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)  // POST defaults to 201, but login isn't creating a resource
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  // --------------------------------------------------------
  // POST /auth/refresh -- Exchange refresh token for new tokens
  //
  // Access tokens expire quickly (15 min) for security.
  // Refresh tokens last longer (7 days) and can get new access tokens.
  //
  // WHY TWO TOKENS:
  // If an access token is stolen, the attacker has only 15 min.
  // Refresh tokens are used less frequently and can be revoked.
  //
  // TRY IT:
  //   curl -X POST http://localhost:3000/auth/refresh \
  //     -H "Content-Type: application/json" \
  //     -d '{"refreshToken":"<paste-refresh-token>"}'
  // --------------------------------------------------------
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  // --------------------------------------------------------
  // GET /auth/me -- Get current authenticated user
  //
  // NO @Public() here -- JwtAuthGuard requires a valid token.
  // The guard decodes the token and attaches the payload to
  // request.user. We read it to know WHO is making the request.
  //
  // TRY IT (use the token from /auth/login):
  //   curl http://localhost:3000/auth/me \
  //     -H "Authorization: Bearer <your-access-token>"
  //
  // Without a token:
  //   curl http://localhost:3000/auth/me
  //   -> 401 Unauthorized
  // --------------------------------------------------------
  @Get('me')
  async me(@Request() req: any) {
    // req.user is set by JwtAuthGuard after token verification.
    // It contains the decoded JWT payload: { sub, email, roles, iat, exp }
    return {
      userId: req.user.sub,
      email: req.user.email,
      roles: req.user.roles,
    };
  }
}

// ============================================================
// WHAT'S HAPPENING UNDER THE HOOD:
//
// For a request to GET /auth/me:
//   1. Request arrives with header: Authorization: Bearer eyJ...
//   2. JwtAuthGuard (from nestjs-boot) runs BEFORE your method
//   3. Guard extracts the token from the header
//   4. Guard calls jwt.verify(token, secret) to decode + validate
//   5. If valid: attaches decoded payload to request.user, continues
//   6. If invalid/expired: throws UnauthorizedException (401)
//   7. Your method runs with req.user populated
//
// Guards run in order: JwtAuthGuard -> RolesGuard -> your method
// @Public() tells JwtAuthGuard to skip validation for that method.
//
// Next lesson: Open src/auth/auth.service.ts
// ============================================================
