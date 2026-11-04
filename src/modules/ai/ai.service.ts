import { HttpException, Injectable } from '@nestjs/common';
import { AiContextAdapter } from './ai-context.adapter';
import { MetaAdapter } from './meta.adapter';
import { SYSTEM } from './system-prompts';
import { SellerDraftService } from './seller-draft';
import { TEAM_CATALOG } from './team-catalog';
import { parseTeamPlan, TEAM_SCHEMA, validTeamInput } from './team-plan';
import { DAY_PLAN_SCHEMA, diagnosisOutputIssue, diagnosisPrompt, diagnosisSchema, formatDiagnosis, parseDayPlan, parseDiagnosisInput } from './structured-ai';

@Injectable()
export class AiService {
  constructor(private readonly context: AiContextAdapter, private readonly meta: MetaAdapter, private readonly seller: SellerDraftService) {}

  async generate(input: unknown, token: string, userId: string) {
    this.meta.configuration();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpException({ error: 'prompt' }, 400);
    const body = input as Record<string, unknown>;
    if (body.task === 'seller-draft') return this.seller.generate(body, token, userId);
    const dayPlan = body.task === 'day-plan';
    const diagnosis = body.task === 'diagnosis';
    const teamPlan = body.task === 'team-plan';
    if (teamPlan && !validTeamInput(body)) throw new HttpException({ error: 'prompt' }, 400);
    const diagnosisInput = diagnosis ? parseDiagnosisInput(body) : null;
    if (diagnosis && !diagnosisInput) throw new HttpException({ error: 'diagnosis_input' }, 400);
    if (dayPlan && (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000 ||
        typeof body.guests !== 'number' || !Number.isInteger(body.guests) || body.guests < 1 || body.guests > 20)) throw new HttpException({ error: 'prompt' }, 400);
    const locale = body.locale === 'en' ? 'en' : 'es';
    if (dayPlan || diagnosis || teamPlan) this.meta.configuration(true);
    const mode = await this.context.load(token, userId, locale, dayPlan || diagnosis || teamPlan);
    if (teamPlan) {
      const system = `You are ARK's business team planning assistant. Respond in ${locale}. ${mode}
Return only the supplied JSON schema. Select at most 8 distinct catalog IDs relevant to the request. If unrelated or insufficient information, understood=false and items=[]; explain briefly in rationale. Otherwise understood=true.
Use monthly for recurring hourly roles (hours per week, 1-40), or one_off for a single hourly job (total hours, 1-40). For unit m use monthly and hours=0; f/p use one_off and hours=0 for ONE unit only; q use quote and hours=0. Never convert fixed jobs into monthly costs. State any assumed scope in rationale and ask for clarification when necessary.
Catalog prices are DEMO estimates, not quotes. Do not invent prices, candidates, providers, contracts, availability or completed actions. Rationale must be readable Unicode. Catalog: ${JSON.stringify(TEAM_CATALOG.map(({ id, name, description, unit }) => ({ id, name: name[locale], description: description[locale], unit })))}`;
      const data = await this.meta.structured(system, [{ role: 'user', content: body.prompt as string }], TEAM_SCHEMA, 4096, false, false);
      if (data.stop_reason === 'max_tokens') throw new HttpException({ error: 'invalid_plan', reason: 'truncated' }, 502);
      if (data.stop_reason !== 'end_turn' || typeof data.model !== 'string' || !data.model.trim() || typeof data.id !== 'string' || !data.id.trim() || !Array.isArray(data.content)) throw new HttpException({ error: 'invalid_plan', reason: 'invalid_metadata' }, 502);
      let output: unknown;
      try { output = JSON.parse(extractText(data.content)); }
      catch { throw new HttpException({ error: 'invalid_plan', reason: 'invalid_json' }, 502); }
      const plan = parseTeamPlan(output);
      if (!plan) throw new HttpException({ error: 'invalid_plan', reason: 'invalid_items' }, 502);
      return { plan, provenance: { provider: 'Meta', model: data.model, responseId: data.id } };
    }
    if (diagnosisInput) {
      const prompt = diagnosisPrompt(diagnosisInput);
      const data = await this.meta.structured(prompt.system + mode, prompt.messages, diagnosisSchema(diagnosisInput.answers), 4096, true, body.tier === 'quick');
      if (data.stop_reason === 'max_tokens') throw new HttpException({ error: 'invalid_diagnosis', reason: 'truncated' }, 502);
      if (data.stop_reason !== 'end_turn' || typeof data.model !== 'string' || !data.model || typeof data.id !== 'string' || !data.id || !Array.isArray(data.content)) {
        throw new HttpException({ error: 'invalid_diagnosis', reason: 'invalid_metadata' }, 502);
      }
      let output: unknown;
      try { output = JSON.parse(extractText(data.content)); }
      catch { throw new HttpException({ error: 'invalid_diagnosis', reason: 'invalid_json' }, 502); }
      const issue = diagnosisOutputIssue(output, diagnosisInput.answers);
      if (issue) {
        console.error('diagnosis_validation', issue);
        throw new HttpException({ error: 'invalid_diagnosis', reason: 'invalid_answers' }, 502);
      }
      const result = formatDiagnosis(output, diagnosisInput.answers);
      return { ...result, provenance: { provider: 'Meta', model: data.model, responseId: data.id } };
    }
    if (dayPlan) {
      const prompt = typeof body.prompt === 'string' ? body.prompt : '';
      const system = `${locale === 'en' ? SYSTEM.en : SYSTEM.es}${mode}\nReturn a day plan matching the supplied JSON schema. Use only this catalog: ${JSON.stringify(SERVICES_FOR_PROMPT(locale))}\nNever invent service IDs, prices, confirmed providers or availability. Use each ID at most once. For unrelated requests or when no service fits, return understood=false and items=[]. Otherwise understood=true. Guests must be 1-20; quantity is hours for hourly services and 1 for other units. Times are local HH:MM.\nRequested guests: ${body.guests}.`;
      const data = await this.meta.structured(system, [{ role: 'user', content: prompt }], DAY_PLAN_SCHEMA, 4096, false, body.tier === 'quick');
      if (data.stop_reason === 'max_tokens') throw new HttpException({ error: 'invalid_plan', reason: 'truncated' }, 502);
      if (data.stop_reason !== 'end_turn' || typeof data.model !== 'string' || !data.model || typeof data.id !== 'string' || !data.id || !Array.isArray(data.content)) {
        throw new HttpException({ error: 'invalid_plan', reason: 'invalid_metadata' }, 502);
      }
      let output: unknown;
      try { output = JSON.parse(extractText(data.content)); }
      catch { throw new HttpException({ error: 'invalid_plan', reason: 'invalid_json' }, 502); }
      const plan = parseDayPlan(output);
      if (!plan) throw new HttpException({ error: 'invalid_plan', reason: 'invalid_items' }, 502);
      return { plan, provenance: { provider: 'Meta', model: data.model, responseId: data.id } };
    }
    const prompt = String(body.prompt || '').slice(0, 60000);
    if (!prompt) throw new HttpException({ error: 'prompt' }, 400);
    const system = SYSTEM[locale] + mode + (body.json ? ' Respond ONLY with valid JSON, no extra text or code blocks.' : '');
    return { text: await this.meta.text(system, prompt, body.tier === 'quick'), user: userId };
  }
}

import { SERVICES } from './service-catalog';
function SERVICES_FOR_PROMPT(locale: 'es' | 'en') {
  return SERVICES.map(({ id, name, description, unit }) => ({ id, name: name[locale], description: description[locale], unit }));
}

function extractText(content: unknown[]): string {
  const chunks: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object' || !('type' in block) || block.type !== 'text') continue;
    if (!('text' in block) || typeof block.text !== 'string') throw new Error('Invalid text block');
    chunks.push(block.text);
  }
  return chunks.join('\n');
}
