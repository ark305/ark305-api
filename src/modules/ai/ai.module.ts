import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiContextAdapter } from './ai-context.adapter';
import { MetaAdapter } from './meta.adapter';
import { ProfilesModule } from '../profiles/profiles.module';
import { SellerDraftService } from './seller-draft';
import { TeamProposalsModule } from '../team-proposals/team-proposals.module';

@Module({ imports: [ProfilesModule, TeamProposalsModule], controllers: [AiController], providers: [AiService, AiContextAdapter, MetaAdapter, SellerDraftService] })
export class AiModule {}
