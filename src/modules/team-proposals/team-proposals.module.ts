import { BadRequestException, Controller, Get, Header, Module, NotFoundException, Param, Req } from '@nestjs/common';
import { accessToken } from '../requests/requests.controller';
import { AuthenticatedRequest } from '../identity/identity.guard';
import { TeamProposalsService } from './team-proposals.service';

@Controller('team-proposals')
class TeamProposalsController {
  constructor(private readonly proposals: TeamProposalsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: AuthenticatedRequest) {
    return { items: await this.proposals.list(accessToken(request), request.principal!.id) };
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException();
    const result = await this.proposals.detail(accessToken(request), request.principal!.id, id);
    if (!result) throw new NotFoundException();
    return result;
  }
}

@Module({ controllers: [TeamProposalsController], providers: [TeamProposalsService], exports: [TeamProposalsService] })
export class TeamProposalsModule {}
