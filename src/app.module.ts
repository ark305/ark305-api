import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { RequestsModule } from './modules/requests/requests.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';

@Module({ imports: [IdentityModule, HealthModule, CatalogModule, RequestsModule, AiModule, ProfilesModule] })
export class AppModule {}
