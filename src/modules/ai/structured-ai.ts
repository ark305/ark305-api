import { HttpException } from '@nestjs/common';
import { allQuestions, buildSnapshot, FLOWS, nextQuestion, sanitize, type Answers, type Question } from '../../domain/diagnosis';
import { findService, SERVICES } from './service-catalog';

type Conversation = { role: 'user' | 'assistant'; content: string }[];
type DiagnosisInput = { message: string; answers: Answers; conversation: Conversation; locale: 'es' | 'en' };
type Plan = { guests: number; understood: boolean; items: { id: string; time: string; qty: number; guests: number }[] };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function parseDiagnosisInput(value: Record<string, unknown>): DiagnosisInput | null {
  if (Object.keys(value).some(key => !['task', 'locale', 'message', 'answers', 'conversation'].includes(key)) ||
      value.task !== 'diagnosis' || (value.locale !== 'es' && value.locale !== 'en') ||
      typeof value.message !== 'string' || !value.message.trim() || value.message.length > 2000 || !validAnswers(value.answers)) return null;
  const conversation = value.conversation ?? [];
  if (!Array.isArray(conversation) || conversation.length > 8) return null;
  let total = value.message.length;
  const normalized: Conversation = [];
  for (const message of conversation) {
    if (!record(message) || Object.keys(message).some(key => key !== 'role' && key !== 'content') ||
        (message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string' ||
        !message.content.trim() || message.content.length > 2000 || (total += message.content.length) > 10000) return null;
    normalized.push({ role: message.role, content: message.content });
  }
  return { message: value.message.trim(), answers: sanitize(value.answers), conversation: normalized, locale: value.locale };
}

function questionFor(who: Answers['who'], key: string): Question | undefined {
  if (key === 'who') return { id: 'who', ask: { es: '', en: '' }, kind: 'single', options: [
    { id: 'individual', label: { es: '', en: '' } }, { id: 'earner', label: { es: '', en: '' } },
    { id: 'company', label: { es: '', en: '' } }, { id: 'enterprise', label: { es: '', en: '' } },
  ] };
  return who ? FLOWS[who].find(question => question.id === key) : undefined;
}

function validAnswer(question: Question, value: unknown, substantive = false): boolean {
  if (question.kind === 'text') return typeof value === 'string' && value.length <= 120 && (!substantive || Boolean(value.trim()));
  if (question.kind === 'single') return typeof value === 'string' &&
    (!substantive && value === '' || question.options?.some(option => option.id === value) === true && (!substantive || value.length > 0));
  return Array.isArray(value) && value.length <= 10 && new Set(value).size === value.length &&
    (!substantive || value.length > 0) && value.every(entry => typeof entry === 'string' && question.options?.some(option => option.id === entry));
}

function validAnswers(value: unknown): value is Answers {
  if (!record(value)) return false;
  const who = value.who;
  if (who !== undefined && (typeof who !== 'string' || !['individual', 'earner', 'company', 'enterprise'].includes(who))) return false;
  if (who === undefined && Object.keys(value).some(key => key !== 'who')) return false;
  const selectedWho = typeof who === 'string' ? who as Answers['who'] : undefined;
  return Object.entries(value).every(([key, answer]) => { const question = questionFor(selectedWho, key); return Boolean(question && validAnswer(question, answer)); });
}

export type DiagnosisIssue = { field: string; code: 'invalid_type' | 'unknown_field' | 'invalid_value' | 'missing_who' | 'wrong_flow' | 'duplicate_items' };
const knownAnswerFields = new Set(['who', ...Object.values(FLOWS).flat().map(question => question.id)]);

export function diagnosisOutputIssue(value: unknown, previous: Answers): DiagnosisIssue | null {
  if (!record(value)) return { field: '$', code: 'invalid_type' };
  if (Object.keys(value).some(key => key !== 'reply' && key !== 'answers')) return { field: '$', code: 'unknown_field' };
  if (typeof value.reply !== 'string' || !value.reply.trim() || value.reply.length > 1600) return { field: 'reply', code: 'invalid_value' };
  if (!record(value.answers)) return { field: 'answers', code: 'invalid_type' };
  const patch = value.answers as Record<string, unknown>;
  const who = patch.who ?? previous.who;
  if (patch.who !== undefined && (typeof patch.who !== 'string' || !['individual', 'earner', 'company', 'enterprise'].includes(patch.who))) return { field: 'answers.who', code: 'invalid_value' };
  if (who === undefined && Object.keys(patch).some(key => key !== 'who')) return { field: 'answers.who', code: 'missing_who' };
  for (const [key, answer] of Object.entries(patch)) {
    if (!knownAnswerFields.has(key)) return { field: 'answers', code: 'unknown_field' };
    const question = questionFor(who as Answers['who'], key);
    const field = `answers.${key}`;
    if (!question) return { field, code: 'wrong_flow' };
    if (Array.isArray(answer) && new Set(answer).size !== answer.length) return { field, code: 'duplicate_items' };
    if (!validAnswer(question, answer, true)) return { field, code: 'invalid_value' };
  }
  return null;
}

function questionSchema(question: Question) {
  if (question.kind === 'text') return { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' };
  if (question.kind === 'single') return { type: 'string', enum: (question.options ?? []).map(option => option.id) };
  return { type: 'array', description: 'Choose each option at most once; duplicate entries are invalid.', minItems: 1, maxItems: 10, items: { type: 'string', enum: (question.options ?? []).map(option => option.id) } };
}

export function diagnosisSchema(previous: Answers) {
  const branches = Object.entries(FLOWS).map(([who, questions]) => ({ type: 'object', additionalProperties: false,
    required: previous.who === who ? [] : ['who'], properties: { who: { type: 'string', enum: [who] },
      ...Object.fromEntries(questions.map(question => [question.id, questionSchema(question)])) } }));
  return { type: 'object', additionalProperties: false, required: ['reply', 'answers'], properties: {
    reply: { type: 'string', minLength: 1, maxLength: 1600, pattern: '\\S' }, answers: { anyOf: [...branches, { type: 'object', additionalProperties: false, properties: {} }] },
  } };
}

export function diagnosisPrompt(input: DiagnosisInput) {
  const describe = (question: Question) => ({ id: question.id, ask: question.ask[input.locale], kind: question.kind, options: question.options?.map(option => ({ id: option.id, label: option.label[input.locale] })) });
  const questions = allQuestions(input.answers).filter(question => !question.showIf || question.showIf(input.answers)).map(describe);
  const initial = input.answers.who ? null : Object.fromEntries(Object.entries(FLOWS).map(([who, flow]) => [who, flow.map(describe)]));
  const pending = nextQuestion(input.answers); const snapshot = pending ? null : buildSnapshot(input.answers);
  const system = [input.locale === 'en' ? 'You are ARK, an empathetic ARK305 onboarding guide. Speak clearly and warmly. The user is completing a guided conversation to receive a personalized proposal.' : 'Eres ARK, una guía empática de bienvenida de ARK305. Habla con claridad y calidez. La persona participa en una conversación guiada para recibir una propuesta personalizada.',
    'Return only JSON matching the supplied schema. `answers` is a patch containing only fields supported by the provided question catalog. Use an enum option ID, not its display label. First extract explicit answers from the latest user message into the patch; never infer answers, and omit unknown or unanswered fields. Update an earlier answer only when the latest user message clearly changes it. After applying the patch, choose the next unanswered field from the appropriate known flow and never re-ask a field answered by this turn. Any proposal must be grounded only in known facts from validated answers. Do not invent prices, providers, availability, bookings, business metrics, medical/legal advice, or permissions. The proposal is explanatory text only; actions and metrics are computed by the application.',
    `Locale: ${input.locale}. Current validated answers: ${JSON.stringify(input.answers)}. Known questions and allowed values: ${JSON.stringify(questions)}.`,
    ...(initial ? [`First identify who from the user's explicit intent, then extract all explicitly supplied answers from that flow in the same patch. Do not ask again for details already provided. Available flows: ${JSON.stringify(initial)}.`] : []),
    pending ? `After applying the answer patch from this message, ask one clear, conversational question for the next unanswered field in the appropriate known flow. Do not ask for ${pending.id} if the latest message answered it. You may acknowledge the user's message, but do not skip unknown details or fill unanswered fields. If the patch completes all known fields, offer a concise proposal grounded only in the validated answers; do not ask another intake question.` : `All known intake fields are answered. Use the deterministic application snapshot as grounding and offer or adjust a concise proposal. Do not claim the proposal is a booking or verified provider match. Current snapshot: ${JSON.stringify(snapshot)}.`].join('\n\n');
  return { system, messages: [...input.conversation, { role: 'user' as const, content: input.message }] };
}

export const DAY_PLAN_SCHEMA = { type: 'object', additionalProperties: false, required: ['guests', 'understood', 'items'], properties: {
  guests: { type: 'integer', minimum: 1, maximum: 20 }, understood: { type: 'boolean' }, items: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['id', 'time', 'qty'], properties: {
    id: { type: 'string', enum: SERVICES.map(service => service.id) }, time: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' }, qty: { type: 'integer', minimum: 1, maximum: 12 },
  } } },
} };

export function parseDayPlan(value: unknown): Plan | null {
  if (!record(value) || Object.keys(value).some(key => !['guests', 'understood', 'items'].includes(key)) ||
      typeof value.guests !== 'number' || !Number.isInteger(value.guests) || value.guests < 1 || value.guests > 20 || typeof value.understood !== 'boolean' ||
      !Array.isArray(value.items) || value.items.length > 10 || value.understood !== (value.items.length > 0)) return null;
  const guests = value.guests as number;
  const seen = new Set<string>(); const items: Plan['items'] = [];
  for (const item of value.items) {
    if (!record(item)) return null;
    const service = findService(item.id);
    if (!service || Object.keys(item).some(key => !['id', 'time', 'qty'].includes(key)) || seen.has(service.id) ||
        typeof item.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) || typeof item.qty !== 'number' || !Number.isInteger(item.qty) ||
        item.qty < 1 || item.qty > 12 || (service.unit !== 'h' && item.qty !== 1)) return null;
    seen.add(service.id); items.push({ id: service.id, time: item.time, qty: item.qty, guests });
  }
  return { guests, understood: value.understood as boolean, items };
}

export function formatDiagnosis(value: unknown, previous: Answers) {
  if (diagnosisOutputIssue(value, previous)) throw new HttpException({ error: 'invalid_diagnosis', reason: 'invalid_answers' }, 502);
  const response = value as { reply: string; answers: Answers };
  const merged = response.answers.who && response.answers.who !== previous.who ? response.answers : { ...previous, ...response.answers };
  const answers = sanitize(merged);
  return { reply: response.reply.trim(), answers, complete: nextQuestion(answers) === null };
}
