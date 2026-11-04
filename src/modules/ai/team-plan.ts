import { TEAM_CATALOG } from './team-catalog';

type Cadence = 'monthly' | 'one_off' | 'quote';
type Item = { id: string; hours: number; cadence: Cadence; amount: number | null };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const readable = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 1200 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffd]/u.test(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));

export const TEAM_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['understood', 'rationale', 'items'],
  properties: {
    understood: { type: 'boolean' }, rationale: { type: 'string', minLength: 1, maxLength: 1200 },
    items: { type: 'array', maxItems: 8, items: { anyOf: TEAM_CATALOG.map(p => ({
      type: 'object', additionalProperties: false, required: ['id', 'hours', 'cadence'], properties: {
        id: { type: 'string', enum: [p.id] },
        hours: p.unit === 'h' ? { type: 'integer', minimum: 1, maximum: 40 } : { type: 'integer', enum: [0] },
        cadence: { type: 'string', enum: p.unit === 'h' ? ['monthly', 'one_off'] : p.unit === 'm' ? ['monthly'] : p.unit === 'q' ? ['quote'] : ['one_off'] },
      },
    })) } },
  },
};

export function validTeamInput(body: Record<string, unknown>) {
  return keys(body, ['task', 'prompt', 'locale']) && (body.locale === 'es' || body.locale === 'en') &&
    typeof body.prompt === 'string' && !!body.prompt.trim() && body.prompt.length <= 4000;
}

export function parseTeamPlan(value: unknown) {
  if (!record(value) || !keys(value, ['understood', 'rationale', 'items']) || typeof value.understood !== 'boolean' ||
    !readable(value.rationale) || !Array.isArray(value.items) || value.items.length > 8 || value.understood !== (value.items.length > 0)) return null;
  const items: Item[] = [];
  for (const line of value.items) {
    if (!record(line) || !keys(line, ['id', 'hours', 'cadence']) || typeof line.hours !== 'number' || !Number.isInteger(line.hours)) return null;
    const p = TEAM_CATALOG.find(p => p.id === line.id);
    if (!p || items.some(item => item.id === p.id)) return null;
    const periods = p.unit === 'h' ? ['monthly', 'one_off'] : p.unit === 'm' ? ['monthly'] : p.unit === 'q' ? ['quote'] : ['one_off'];
    if (!periods.includes(String(line.cadence)) || (p.unit === 'h' ? line.hours < 1 || line.hours > 40 : line.hours !== 0)) return null;
    const amount = p.unit === 'q' ? null : Math.round(p.rate * (p.unit === 'h' ? line.hours * (line.cadence === 'monthly' ? 4.33 : 1) : 1));
    items.push({ id: p.id, hours: line.hours, cadence: line.cadence as Cadence, amount });
  }
  return { understood: value.understood, rationale: value.rationale.trim(), items, demo: true as const,
    monthlyTotal: items.filter(i => i.cadence === 'monthly').reduce((s, i) => s + (i.amount ?? 0), 0),
    oneOffTotal: items.filter(i => i.cadence === 'one_off').reduce((s, i) => s + (i.amount ?? 0), 0),
    quoteCount: items.filter(i => i.cadence === 'quote').length };
}
