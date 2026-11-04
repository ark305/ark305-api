import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogPort } from './catalog.port.js';
import { DemoCatalogAdapter } from './demo-catalog.adapter.js';

@Module({
  controllers: [CatalogController],
  providers: [{ provide: CatalogPort, useClass: DemoCatalogAdapter }],
  exports: [CatalogPort],
})
export class CatalogModule {}
