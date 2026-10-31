import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { IdentityModule } from './modules/identity/identity.module';
import { RequestsModule } from './modules/requests/requests.module';

@Module({ imports: [IdentityModule, HealthModule, CatalogModule, RequestsModule] })
export class AppModule {}
