import { HttpException, Injectable } from '@nestjs/common';

@Injectable()
export class MetaAdapter {
  configuration() {
    const key = process.env.META_API_KEY;
    try {
      const origin = new URL(process.env.META_BASE_URL || 'https://api.meta.ai');
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
      if (!key || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) ||
          origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error();
      return { key, origin };
    } catch { throw new HttpException({ error: 'ai_not_configured' }, 503); }
  }

  async text(system: string, prompt: string, quick: boolean): Promise<string> {
    const { key, origin } = this.configuration();
    try {
      const response = await fetch(new URL('/v1/messages', origin), {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000), redirect: 'error', cache: 'no-store',
        body: JSON.stringify({ model: (quick && process.env.META_MODEL_QUICK) || process.env.META_MODEL || 'muse-spark-1.3',
          max_tokens: 1500, system, messages: [{ role: 'user', content: prompt }] }),
      });
      if (response.status === 429) throw new HttpException({ error: 'rate_limited' }, 429);
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('content' in data) || !Array.isArray(data.content)) throw new Error();
      const blocks = data.content.filter((block: unknown): block is { type: string; text: string } =>
        Boolean(block) && typeof block === 'object' && 'type' in block! && block.type === 'text');
      if (blocks.some(block => typeof block.text !== 'string')) throw new Error();
      return blocks.map(block => block.text).join('\n');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: 'upstream' }, 502);
    }
  }
}
