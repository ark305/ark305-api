import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';

@Module({ imports: [HealthModule, CatalogModule] })
export class AppModule {}
