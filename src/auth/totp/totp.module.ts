import { Module } from '@nestjs/common';
import { TotpService } from './totp.service';

/**
 * TotpModule — provides TotpService for TOTP / 2FA.
 * NO storage — caller stores secret in their user model.
 *
 * ```ts
 * @Module({ imports: [TotpModule] })
 * export class AuthModule {}
 * ```
 */
@Module({
  providers: [TotpService],
  exports: [TotpService],
})
export class TotpModule {}
