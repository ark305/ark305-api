import { Module } from '@nestjs/common';
import { ProviderServicesController } from './provider-services.controller.js';
import { ProviderServicesPort } from './provider-services.port.js';
import { ProviderServicesService } from './provider-services.service.js';
import { SupabaseProviderServicesAdapter } from './supabase-provider-services.adapter.js';

// Provider-published services (Supabase `services`). Separate from CatalogModule, whose demo catalog the AI and requests modules still use.
@Module({
  controllers: [ProviderServicesController],
  providers: [{ provide: ProviderServicesPort, useClass: SupabaseProviderServicesAdapter }, ProviderServicesService],
  exports: [ProviderServicesService],
})
export class ProviderServicesModule {}
