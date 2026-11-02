import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiContextAdapter } from './ai-context.adapter';
import { MetaAdapter } from './meta.adapter';

@Module({ controllers: [AiController], providers: [AiService, AiContextAdapter, MetaAdapter] })
export class AiModule {}
