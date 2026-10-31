import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IdentityController } from './identity.controller';
import { IdentityGuard } from './identity.guard';
import { IdentityPort } from './identity.port';
import { SupabaseIdentityAdapter } from './supabase-identity.adapter';

@Module({
  controllers: [IdentityController],
  providers: [
    { provide: IdentityPort, useClass: SupabaseIdentityAdapter },
    { provide: APP_GUARD, useClass: IdentityGuard },
  ],
})
export class IdentityModule {}
