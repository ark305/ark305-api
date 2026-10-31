import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityPort, Principal } from './identity.port';
import { PUBLIC_ROUTE } from './public.decorator';

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  principal?: Principal;
};

@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly identity: IdentityPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.get<boolean>(PUBLIC_ROUTE, context.getHandler())) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const match = typeof header === 'string' && header.length <= 8192 && /^Bearer ([^\s,]+)$/i.exec(header);
    if (!match) throw new UnauthorizedException();
    const principal = await this.identity.verify(match[1]);
    if (!principal) throw new UnauthorizedException();
    request.principal = principal;
    return true;
  }
}
