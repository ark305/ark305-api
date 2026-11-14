import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedRequest } from '../identity/identity.guard.js';
import { ProviderServicesService } from './provider-services.service.js';

function accessToken(request: AuthenticatedRequest): string {
  if (!request.principal) throw new UnauthorizedException();
  const match = typeof request.headers.authorization === 'string' && /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization);
  if (!match) throw new UnauthorizedException();
  return match[1];
}

// The owner always comes from the verified JWT (`principal.id`), never from the body or query.
@Controller('services')
export class ProviderServicesController {
  constructor(private readonly services: ProviderServicesService) {}

  @Get() @Header('Cache-Control', 'no-store')
  async search(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.services.search(accessToken(request), query);
  }

  @Get('mine') @Header('Cache-Control', 'no-store')
  mine(@Req() request: AuthenticatedRequest) {
    return this.services.listOwn(accessToken(request), request.principal!.id);
  }

  @Get(':id') @Header('Cache-Control', 'no-store')
  detail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.services.findById(accessToken(request), request.principal!.id, id);
  }

  @Post() @Header('Cache-Control', 'no-store')
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.services.create(accessToken(request), request.principal!.id, body);
  }

  @Patch(':id') @Header('Cache-Control', 'no-store')
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.services.update(accessToken(request), request.principal!.id, id, body);
  }

  @Post(':id/deactivate') @HttpCode(200) @Header('Cache-Control', 'no-store')
  deactivate(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.services.deactivate(accessToken(request), request.principal!.id, id);
  }
}
