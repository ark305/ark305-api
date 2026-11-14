import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../identity/identity.guard.js';
import { accessToken } from '../requests/requests.controller.js';
import { GhlAccess } from './ghl-access.js';
import { GhlService, parseContactInput, parseMessageInput, parseServiceOrder } from './ghl.service.js';

@Controller('ghl')
export class GhlController {
  constructor(private readonly ghl: GhlService, private readonly access: GhlAccess) {}

  private async operator(request: AuthenticatedRequest) {
    await this.access.requireOperator(accessToken(request), request.principal!.id);
  }

  @Post('contacts')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async upsertContact(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseContactInput(body, false);
    await this.operator(request);
    return this.ghl.upsertContact(input);
  }

  @Put('contacts/:id')
  @Header('Cache-Control', 'no-store')
  async updateContact(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    const input = parseContactInput(body, true);
    await this.operator(request);
    return { contact: await this.ghl.updateContact(id, input) };
  }

  @Post('opportunities')
  @Header('Cache-Control', 'no-store')
  async createOpportunity(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const order = parseServiceOrder(body);
    await this.operator(request);
    return { opportunity: await this.ghl.createServiceOrder(order) };
  }

  @Post('messages')
  @Header('Cache-Control', 'no-store')
  async sendMessage(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseMessageInput(body);
    await this.operator(request);
    return { message: await this.ghl.sendMessage(input) };
  }

  @Get('calendars')
  @Header('Cache-Control', 'no-store')
  async calendars() {
    return { items: await this.ghl.listCalendars() };
  }

  @Get('calendars/:id/free-slots')
  @Header('Cache-Control', 'no-store')
  freeSlots(@Param('id') id: string, @Query('startDate') startDate: unknown, @Query('endDate') endDate: unknown, @Query('timezone') timezone: unknown) {
    return this.ghl.availability(id, startDate, endDate, timezone);
  }
}
