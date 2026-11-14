import { Module } from '@nestjs/common';
import { SupabaseTrackingAdapter } from './supabase-tracking.adapter.js';
import { TrackingController } from './tracking.controller.js';
import { TrackingPort } from './tracking.port.js';
import { TrackingService } from './tracking.service.js';

@Module({
  controllers: [TrackingController],
  providers: [{ provide: TrackingPort, useClass: SupabaseTrackingAdapter }, TrackingService],
})
export class TrackingModule {}
