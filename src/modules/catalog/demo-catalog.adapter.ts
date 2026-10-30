import { Injectable } from '@nestjs/common';
import { CatalogPort, CatalogService } from './catalog.port';
import { demoServices } from './demo-services';

@Injectable()
export class DemoCatalogAdapter extends CatalogPort {
  async list(): Promise<CatalogService[]> {
    return structuredClone(demoServices);
  }

  async findById(id: string): Promise<CatalogService | undefined> {
    return structuredClone(demoServices.find((item) => item.id === id));
  }
}
