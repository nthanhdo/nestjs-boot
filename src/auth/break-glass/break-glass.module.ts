import { Module } from '@nestjs/common';
import { BreakGlassGuard } from './break-glass.guard';

@Module({
  providers: [BreakGlassGuard],
  exports: [BreakGlassGuard],
})
export class BreakGlassModule {}
