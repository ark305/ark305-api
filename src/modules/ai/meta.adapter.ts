import { HttpException, Injectable } from '@nestjs/common';

@Injectable()
export class MetaAdapter {
  configuration(structured = false) {
    const key = process.env.MODEL_API_KEY;
    try {
      const origin = new URL(process.env.META_BASE_URL || 'https://api.meta.ai');
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
      if (!key || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) ||
          origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
          (structured && origin.origin !== 'https://api.meta.ai')) throw new Error();
      return { key, origin };
    } catch { throw new HttpException({ error: 'ai_not_configured' }, 503); }
  }

  async catalogPlan(system: string, prompt: string, schema: unknown, tools: unknown[],
    execute: (name: string, input: unknown) => Promise<unknown>, quick = false) {
    const { key, origin } = this.configuration(true);
    const signal = AbortSignal.timeout(50000); // One budget for the entire two-round exchange.
    const messages: { role: string; content: unknown }[] = [{ role: 'user', content: prompt }];
    const evidence: { name: string; callId: string; input: unknown; result: unknown }[] = [];
    const request = async (final: boolean) => {
      const response = await fetch(new URL('/v1/messages', origin), {
        method: 'POST', redirect: 'error', cache: 'no-store', signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: (quick && process.env.META_MODEL_QUICK) || process.env.META_MODEL || 'muse-spark-1.3',
          max_tokens: 4096, system, messages,
          ...(final ? {} : { tools, tool_choice: { type: 'auto' } }),
          output_config: { effort: 'low', ...(final ? { format: { type: 'json_schema', schema } } : {}) } }),
      });
      if (response.status === 429) throw new HttpException({ error: 'rate_limited' }, 429);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data || typeof data !== 'object' || !Array.isArray(data.content)) throw new Error();
      if (data.stop_reason === 'max_tokens') throw new HttpException({ error: 'invalid_plan', reason: 'truncated' }, 502);
      return data as { stop_reason?: string; model?: string; id?: string; content: unknown[] };
    };
    try {
      const first = await request(false);
      const calls = first.content.filter((block): block is { type: string; id: string; name: string; input: unknown } =>
        Boolean(block) && typeof block === 'object' && 'type' in block! && block.type === 'tool_use');
      if (first.stop_reason !== 'tool_use' || !calls.length || calls.length > 3) throw new Error();
      const seen = new Set<string>();
      const results = [];
      for (const call of calls) {
        if (typeof call.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(call.id) || seen.has(call.id) || typeof call.name !== 'string') throw new Error();
        seen.add(call.id);
        const result = await execute(call.name, call.input);
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result) });
        evidence.push({ name: call.name, callId: call.id, input: call.input, result });
      }
      // Replay the provider's blocks, including opaque reasoning, without logging them.
      messages.push({ role: 'assistant', content: first.content }, { role: 'user', content: results });
      const data = await request(true);
      if (data.stop_reason !== 'end_turn') throw new Error();
      return { data, evidence };
    } catch (error) {
      if (error instanceof HttpException && [429, 502, 503].includes(error.getStatus())) throw error;
      throw new HttpException({ error: 'upstream' }, 502);
    }
  }

  async structured(system: string, messages: { role: 'user' | 'assistant'; content: string }[], schema: unknown, maxTokens: number, diagnosis = false, quick = false) {
    const { key, origin } = this.configuration(true);
    try {
      const response = await fetch(new URL('/v1/messages', origin), {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000), redirect: 'error', cache: 'no-store',
        body: JSON.stringify({ model: (quick && process.env.META_MODEL_QUICK) || process.env.META_MODEL || 'muse-spark-1.3', max_tokens: maxTokens,
          ...(diagnosis ? { output_config: { effort: 'low', format: { type: 'json_schema', schema } } } : { output_config: { format: { type: 'json_schema', schema } } }),
          system, messages }),
      });
      if (response.status === 429) throw new HttpException({ error: 'rate_limited' }, 429);
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') throw new Error();
      return data as { stop_reason?: string; model?: string; id?: string; content?: unknown };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: 'upstream' }, 502);
    }
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
