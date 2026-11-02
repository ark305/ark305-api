import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../identity/identity.guard';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  generate(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    // IdentityGuard validates both the header and the principal before this handler.
    const token = request.headers.authorization!.slice(7);
    return this.ai.generate(body, token, request.principal!.id);
  }
}
