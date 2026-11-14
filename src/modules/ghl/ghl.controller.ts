import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../identity/identity.guard.js';
import { accessToken } from '../requests/requests.controller.js';
import { GhlAccountsService, GhlActingMode, parseAccountInput } from './ghl-accounts.service.js';
import { GhlService, parseContactInput, parseMessageInput, parseServiceOrder } from './ghl.service.js';

// `?providerId=` runs a call against that provider's connected GHL account; without it ARK's own account is used.
@Controller('ghl')
export class GhlController {
  constructor(private readonly ghl: GhlService, private readonly accounts: GhlAccountsService) {}

  private account(request: AuthenticatedRequest, providerId: unknown, mode: GhlActingMode) {
    return this.accounts.resolve(accessToken(request), request.principal!.id, providerId, mode);
  }

  @Get('account')
  @Header('Cache-Control', 'no-store')
  ownAccount(@Req() request: AuthenticatedRequest) {
    return this.accounts.ownStatus(accessToken(request), request.principal!.id);
  }

  @Put('account')
  @Header('Cache-Control', 'no-store')
  connect(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseAccountInput(body);
    return this.accounts.connect(accessToken(request), request.principal!.id, input);
  }

  @Delete('account')
  @Header('Cache-Control', 'no-store')
  disconnect(@Req() request: AuthenticatedRequest) {
    return this.accounts.disconnect(accessToken(request), request.principal!.id);
  }

  @Get('accounts')
  @Header('Cache-Control', 'no-store')
  async listAccounts(@Req() request: AuthenticatedRequest) {
    return { items: await this.accounts.list(accessToken(request), request.principal!.id) };
  }

  @Get('accounts/:providerId')
  @Header('Cache-Control', 'no-store')
  providerAccount(@Req() request: AuthenticatedRequest, @Param('providerId') providerId: string) {
    return this.accounts.providerStatus(accessToken(request), request.principal!.id, providerId);
  }

  @Post('contacts')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async upsertContact(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Query('providerId') providerId: unknown) {
    const input = parseContactInput(body, false);
    return this.ghl.upsertContact(input, await this.account(request, providerId, 'write'));
  }

  @Put('contacts/:id')
  @Header('Cache-Control', 'no-store')
  async updateContact(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Query('providerId') providerId: unknown) {
    const input = parseContactInput(body, true);
    const account = await this.account(request, providerId, 'write');
    return { contact: await this.ghl.updateContact(id, input, account) };
  }

  @Post('opportunities')
  @Header('Cache-Control', 'no-store')
  async createOpportunity(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Query('providerId') providerId: unknown) {
    const order = parseServiceOrder(body);
    const account = await this.account(request, providerId, 'write');
    return { opportunity: await this.ghl.createServiceOrder(order, account) };
  }

  @Post('messages')
  @Header('Cache-Control', 'no-store')
  async sendMessage(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Query('providerId') providerId: unknown) {
    const input = parseMessageInput(body);
    const account = await this.account(request, providerId, 'write');
    return { message: await this.ghl.sendMessage(input, account) };
  }

  @Get('calendars')
  @Header('Cache-Control', 'no-store')
  async calendars(@Req() request: AuthenticatedRequest, @Query('providerId') providerId: unknown) {
    return { items: await this.ghl.listCalendars(await this.account(request, providerId, 'read')) };
  }

  @Get('calendars/:id/free-slots')
  @Header('Cache-Control', 'no-store')
  async freeSlots(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Query('startDate') startDate: unknown,
    @Query('endDate') endDate: unknown, @Query('timezone') timezone: unknown, @Query('providerId') providerId: unknown) {
    return this.ghl.availability(id, startDate, endDate, timezone, await this.account(request, providerId, 'read'));
  }
}
