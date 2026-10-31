import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { RequestsController } from './requests.controller';
import { RequestsPort } from './requests.port';
import { SupabaseRequestsAdapter } from './supabase-requests.adapter';

@Module({
  imports: [CatalogModule],
  controllers: [RequestsController],
  providers: [{ provide: RequestsPort, useClass: SupabaseRequestsAdapter }],
})
export class RequestsModule {}
