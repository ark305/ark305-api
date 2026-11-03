import { BadRequestException, Body, Controller, Get, Header, Param, Patch, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '../identity/identity.guard';
import { accessToken } from './requests.controller';
import { RequestsPort } from './requests.port';
import { canTransitionRequest, RequestStatus } from './request-lifecycle';

@Controller('admin/service-requests')
export class RequestAdministrationController {
  constructor(private readonly requests: RequestsPort) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: AuthenticatedRequest) {
    const token = accessToken(request);
    return { items: await this.requests.listAdmin(token, request.principal!.id) };
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  transition(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
        !body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid request transition');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => !['expectedStatus', 'status'].includes(key)) ||
        !canTransitionRequest(input.expectedStatus, input.status)) throw new BadRequestException('Invalid request transition');
    const token = accessToken(request);
    return this.requests.transition(token, request.principal!.id, id, input.expectedStatus as RequestStatus, input.status as RequestStatus);
  }
}
