import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { IdentityModule } from './modules/identity/identity.module';
import { RequestsModule } from './modules/requests/requests.module';
import { AiModule } from './modules/ai/ai.module';
import { ProfilesModule } from './modules/profiles/profiles.module';

@Module({ imports: [IdentityModule, HealthModule, CatalogModule, RequestsModule, AiModule, ProfilesModule] })
export class AppModule {}
