import { Controller, Get } from '@nestjs/common';
import { Public } from '../identity/public.decorator.js';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth() {
    return { status: 'ok', service: 'ark305-api' };
  }
}
