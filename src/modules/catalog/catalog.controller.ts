import { BadRequestException, Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CatalogPort } from './catalog.port';
import { Public } from '../identity/public.decorator';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogPort) {}

  @Get()
  @Public()
  async list() {
    return { items: await this.catalog.list() };
  }

  @Get(':id')
  @Public()
  async detail(@Param('id') id: string) {
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) {
      throw new BadRequestException('Invalid service ID');
    }
    const item = await this.catalog.findById(id);
    if (!item) throw new NotFoundException('Service not found');
    return item;
  }
}
