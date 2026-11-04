import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiContextAdapter } from './ai-context.adapter.js';
import { MetaAdapter } from './meta.adapter.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SellerDraftService } from './seller-draft.js';
import { TeamProposalsModule } from '../team-proposals/team-proposals.module.js';

@Module({ imports: [ProfilesModule, TeamProposalsModule], controllers: [AiController], providers: [AiService, AiContextAdapter, MetaAdapter, SellerDraftService] })
export class AiModule {}
