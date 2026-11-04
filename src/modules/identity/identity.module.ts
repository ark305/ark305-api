import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IdentityController } from './identity.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { IdentityPort } from './identity.port.js';
import { SupabaseIdentityAdapter } from './supabase-identity.adapter.js';

@Module({
  controllers: [IdentityController],
  providers: [
    { provide: IdentityPort, useClass: SupabaseIdentityAdapter },
    { provide: APP_GUARD, useClass: IdentityGuard },
  ],
})
export class IdentityModule {}
