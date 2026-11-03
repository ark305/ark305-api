import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { RequestsController } from './requests.controller';
import { RequestsPort } from './requests.port';
import { SupabaseRequestsAdapter } from './supabase-requests.adapter';
import { RequestAdministrationController } from './request-administration.controller';

@Module({
  imports: [CatalogModule],
  controllers: [RequestsController, RequestAdministrationController],
  providers: [{ provide: RequestsPort, useClass: SupabaseRequestsAdapter }],
})
export class RequestsModule {}
