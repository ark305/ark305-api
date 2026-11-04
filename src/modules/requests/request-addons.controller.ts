import { BadRequestException, Body, Controller, Get, Header, Param, Post, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '../identity/identity.guard.js';
import { accessToken } from './requests.controller.js';
import { RequestAddonsService } from './request-addons.service.js';

@Controller('service-requests/:id/addons')
export class RequestAddonsController {
  constructor(private readonly addons: RequestAddonsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.addons.list(accessToken(request), request.principal!.id, id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  accept(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Explicit acceptance required');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => !['serviceId', 'accepted'].includes(key)) || input.accepted !== true ||
        typeof input.serviceId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(input.serviceId)) throw new BadRequestException('Explicit acceptance required');
    return this.addons.accept(accessToken(request), request.principal!.id, id, input.serviceId);
  }
}
