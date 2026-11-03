import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { CatalogPort } from '../catalog/catalog.port';
import { AuthenticatedRequest } from '../identity/identity.guard';
import { CreateServiceRequest, RequestsPort } from './requests.port';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseCreateRequest(body: unknown): CreateServiceRequest {
  if (!isRecord(body) || Object.keys(body).some((key) => !['serviceId', 'requestedDate', 'guests', 'preferences'].includes(key))) {
    throw new BadRequestException('Invalid service request');
  }
  if (typeof body.serviceId !== 'string' || body.serviceId.length === 0 ||
      !isCalendarDate(body.requestedDate) || !Number.isInteger(body.guests) ||
      Number(body.guests) < 1 || Number(body.guests) > 20 ||
      (body.preferences !== undefined && (typeof body.preferences !== 'string' || body.preferences.length > 2000))) {
    throw new BadRequestException('Invalid service request');
  }
  return {
    serviceId: body.serviceId,
    requestedDate: body.requestedDate,
    guests: Number(body.guests),
    preferences: typeof body.preferences === 'string' ? body.preferences : '',
  };
}

export function accessToken(request: AuthenticatedRequest): string {
  if (!request.principal) throw new UnauthorizedException();
  const match = typeof request.headers.authorization === 'string' &&
    /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization);
  if (!match) throw new UnauthorizedException();
  return match[1];
}

@Controller('service-requests')
export class RequestsController {
  constructor(private readonly requests: RequestsPort, private readonly catalog: CatalogPort) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseCreateRequest(body);
    if (!await this.catalog.findById(input.serviceId)) throw new BadRequestException('Invalid service ID');
    const token = accessToken(request);
    return this.requests.create(token, request.principal!.id, input);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedRequest) {
    const token = accessToken(request);
    return this.requests.list(token, request.principal!.id).then((items) => ({ items }));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    if (!UUID.test(id)) throw new BadRequestException('Invalid request ID');
    const item = await this.requests.findById(accessToken(request), request.principal!.id, id);
    if (!item) throw new NotFoundException('Service request not found');
    return item;
  }
}
