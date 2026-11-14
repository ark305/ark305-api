import { Body, Controller, Get, Header, HttpCode, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedRequest } from '../identity/identity.guard.js';
import { TrackingService } from './tracking.service.js';

function accessToken(request: AuthenticatedRequest): string {
  if (!request.principal) throw new UnauthorizedException();
  const match = typeof request.headers.authorization === 'string' && /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization);
  if (!match) throw new UnauthorizedException();
  return match[1];
}

@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post('location') @HttpCode(200) @Header('Cache-Control', 'no-store')
  share(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.tracking.shareLocation(accessToken(request), request.principal!.id, body);
  }

  @Get('nearby') @Header('Cache-Control', 'no-store')
  nearby(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.tracking.nearby(accessToken(request), request.principal!.id, query);
  }

  @Get('locations') @Header('Cache-Control', 'no-store')
  locations(@Req() request: AuthenticatedRequest) {
    return this.tracking.listLocations(accessToken(request), request.principal!.id);
  }
}
