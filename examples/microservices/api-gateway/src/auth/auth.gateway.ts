import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface UserResponse {
  user: User;
}

interface ValidationResponse {
  valid: boolean;
  userId: string;
  roles: string[];
}

interface AuthServiceGrpc {
  login(data: { email: string; password: string }): Observable<AuthResponse>;
  register(data: {
    email: string;
    password: string;
    name: string;
  }): Observable<UserResponse>;
  validateToken(data: { token: string }): Observable<ValidationResponse>;
  refreshToken(data: {
    refreshToken: string;
  }): Observable<AuthResponse>;
}

@Injectable()
export class AuthGateway implements OnModuleInit {
  private authService!: AuthServiceGrpc;

  constructor(
    @Inject('AUTH_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.authService =
      this.client.getService<AuthServiceGrpc>('AuthService');
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.authService.login({ email, password });
  }

  register(
    email: string,
    password: string,
    name: string,
  ): Observable<UserResponse> {
    return this.authService.register({ email, password, name });
  }

  validateToken(token: string): Observable<ValidationResponse> {
    return this.authService.validateToken({ token });
  }

  refreshToken(refreshToken: string): Observable<AuthResponse> {
    return this.authService.refreshToken({ refreshToken });
  }
}
