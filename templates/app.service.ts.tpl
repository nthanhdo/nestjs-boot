import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { message: string; service: string } {
    return {
      message: 'Hello from nestjs-boot!',
      service: '{{name}}',
    };
  }
}
