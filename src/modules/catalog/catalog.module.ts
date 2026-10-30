import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogPort } from './catalog.port';
import { DemoCatalogAdapter } from './demo-catalog.adapter';

@Module({
  controllers: [CatalogController],
  providers: [{ provide: CatalogPort, useClass: DemoCatalogAdapter }],
})
export class CatalogModule {}
