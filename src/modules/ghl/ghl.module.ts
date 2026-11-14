import { Module } from '@nestjs/common';
import { GhlAccess } from './ghl-access.js';
import { GhlAccountsPort } from './ghl-accounts.port.js';
import { GhlAccountsService } from './ghl-accounts.service.js';
import { GhlClient } from './ghl.client.js';
import { GhlController } from './ghl.controller.js';
import { GhlService } from './ghl.service.js';
import { SupabaseGhlAccountsAdapter } from './supabase-ghl-accounts.adapter.js';

@Module({
  controllers: [GhlController],
  providers: [GhlClient, GhlService, GhlAccess, GhlAccountsService, { provide: GhlAccountsPort, useClass: SupabaseGhlAccountsAdapter }],
  exports: [GhlService, GhlAccountsService],
})
export class GhlModule {}
