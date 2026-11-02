import { HttpException, Injectable } from '@nestjs/common';
import { AiContextAdapter } from './ai-context.adapter';
import { MetaAdapter } from './meta.adapter';
import { SYSTEM } from './system-prompts';

@Injectable()
export class AiService {
  constructor(private readonly context: AiContextAdapter, private readonly meta: MetaAdapter) {}

  async generate(input: unknown, token: string, userId: string) {
    this.meta.configuration();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpException({ error: 'prompt' }, 400);
    const body = input as Record<string, unknown>;
    if (body.task === 'day-plan' || body.task === 'diagnosis') throw new HttpException({ error: 'task_not_available' }, 400);
    const locale = body.locale === 'en' ? 'en' : 'es';
    const mode = await this.context.load(token, userId, locale);
    const prompt = String(body.prompt || '').slice(0, 60000);
    if (!prompt) throw new HttpException({ error: 'prompt' }, 400);
    const system = SYSTEM[locale] + mode + (body.json ? ' Respond ONLY with valid JSON, no extra text or code blocks.' : '');
    return { text: await this.meta.text(system, prompt, body.tier === 'quick'), user: userId };
  }
}
