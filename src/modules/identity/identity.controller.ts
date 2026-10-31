import { Controller, Get, Header, Req } from '@nestjs/common';
import { AuthenticatedRequest } from './identity.guard';

@Controller('me')
export class IdentityController {
  @Get()
  @Header('Cache-Control', 'no-store')
  getIdentity(@Req() request: AuthenticatedRequest) {
    return { user: request.principal };
  }
}
