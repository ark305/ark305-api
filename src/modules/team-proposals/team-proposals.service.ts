import { HttpException, Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getSupabaseConfig } from '../identity/supabase-config';
import { TEAM_CATALOG } from '../ai/team-catalog';
import { parseTeamPlan } from '../ai/team-plan';

type Generated = { plan: NonNullable<ReturnType<typeof parseTeamPlan>>; provenance: { provider: string; model: string; responseId: string } };
export type TeamProposal = Omit<Generated, 'plan'> & {
  id: string; ownerId: string; createdAt: string; prompt: string; locale: 'es' | 'en'; version: 1; currency: 'USD';
  plan: Generated['plan'] & { items: (Generated['plan']['items'][number] & { name: string; unit: string; rate: number })[] };
};
type Row = { id: string; owner_id: string; created_at: string; document: string; signature: string };
const unavailable = () => new HttpException({ error: 'proposal_storage' }, 503);

@Injectable()
export class TeamProposalsService {
  private key() {
    const key = process.env.TEAM_PROPOSAL_SIGNING_KEY;
    if (!key || key.length < 32) throw unavailable();
    return key;
  }

  async ready(token: string, owner: string) {
    this.key();
    await this.query(token, 'GET', { owner_id: `eq.${owner}`, select: 'id', limit: '0' });
  }

  async save(token: string, owner: string, prompt: string, locale: 'es' | 'en', result: Generated): Promise<TeamProposal> {
    const proposal: TeamProposal = {
      ...result, id: randomUUID(), ownerId: owner, createdAt: new Date().toISOString(), prompt, locale, version: 1, currency: 'USD',
      plan: { ...result.plan, items: result.plan.items.map(item => {
        const role = TEAM_CATALOG.find(role => role.id === item.id);
        if (!role) throw unavailable();
        return { ...item, name: role.name[locale], unit: role.unit, rate: role.rate };
      }) },
    };
    const document = JSON.stringify(proposal);
    const row: Row = { id: proposal.id, owner_id: owner, created_at: proposal.createdAt, document,
      signature: createHmac('sha256', this.key()).update(document).digest('hex') };
    const rows = await this.query(token, 'POST', {}, row);
    if (rows.length !== 1) throw unavailable();
    const stored = this.verify(rows[0], owner);
    if (stored.id !== proposal.id || (rows[0] as Row).document !== document) throw unavailable();
    return stored;
  }

  async list(token: string, owner: string): Promise<TeamProposal[]> {
    this.key();
    const rows = await this.query(token, 'GET', { owner_id: `eq.${owner}`, order: 'created_at.desc,id.desc', limit: '50' });
    return rows.map(row => this.verify(row, owner));
  }

  async detail(token: string, owner: string, id: string): Promise<TeamProposal | null> {
    this.key();
    const rows = await this.query(token, 'GET', { owner_id: `eq.${owner}`, id: `eq.${id}`, limit: '1' });
    if (!rows.length) return null;
    const proposal = this.verify(rows[0], owner);
    if (proposal.id !== id) throw unavailable();
    return proposal;
  }

  private verify(value: unknown, owner: string): TeamProposal {
    const row = value as Row;
    if (!row || row.owner_id !== owner || typeof row.document !== 'string' || row.document.length > 20000 ||
        typeof row.signature !== 'string' || !/^[a-f0-9]{64}$/.test(row.signature)) throw unavailable();
    const expected = createHmac('sha256', this.key()).update(row.document).digest();
    if (!timingSafeEqual(expected, Buffer.from(row.signature, 'hex'))) throw unavailable();
    let proposal: TeamProposal;
    try { proposal = JSON.parse(row.document); } catch { throw unavailable(); }
    if (!proposal || proposal.version !== 1 || proposal.ownerId !== owner || proposal.id !== row.id ||
        Date.parse(proposal.createdAt) !== Date.parse(row.created_at)) throw unavailable();
    return proposal;
  }

  private async query(token: string, method: 'GET' | 'POST', params: Record<string, string>, body?: Row): Promise<unknown[]> {
    const config = getSupabaseConfig();
    if (!config) throw unavailable();
    const url = new URL('/rest/v1/team_proposals', config.url);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    try {
      const response = await fetch(url, { method, headers: {
        apikey: config.publishableKey, Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store' });
      if (!response.ok) throw unavailable();
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.length > 50) throw unavailable();
      return rows;
    } catch { throw unavailable(); }
  }
}
