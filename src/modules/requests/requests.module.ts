import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { RequestsController } from './requests.controller.js';
import { RequestsPort } from './requests.port.js';
import { SupabaseRequestsAdapter } from './supabase-requests.adapter.js';
import { RequestAdministrationController } from './request-administration.controller.js';
import { RequestAddonsController } from './request-addons.controller.js';
import { RequestAddonsService } from './request-addons.service.js';

@Module({
  imports: [CatalogModule],
  controllers: [RequestsController, RequestAdministrationController, RequestAddonsController],
  providers: [{ provide: RequestsPort, useClass: SupabaseRequestsAdapter }, RequestAddonsService],
})
export class RequestsModule {}
