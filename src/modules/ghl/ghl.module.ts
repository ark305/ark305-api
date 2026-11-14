import { Module } from '@nestjs/common';
import { GhlAccess } from './ghl-access.js';
import { GhlClient } from './ghl.client.js';
import { GhlController } from './ghl.controller.js';
import { GhlService } from './ghl.service.js';

@Module({
  controllers: [GhlController],
  providers: [GhlClient, GhlService, GhlAccess],
  exports: [GhlService],
})
export class GhlModule {}
