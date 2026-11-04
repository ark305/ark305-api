const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TeamProposalsService } = require('../dist/modules/team-proposals/team-proposals.service');
const { parseTeamPlan } = require('../dist/modules/ai/team-plan');

test('snapshots preserve original names/prices, reject tampering and never invoke AI on read', async () => {
  process.env.TEAM_PROPOSAL_SIGNING_KEY = 'local-test-key-not-a-real-secret-123456';
  process.env.SUPABASE_URL = 'http://127.0.0.1:5555'; process.env.SUPABASE_PUBLISHABLE_KEY = 'test';
  const real = global.fetch; let rows = [], calls = [];
  global.fetch = async (url, init) => {
    calls.push({url:String(url),init});
    if (init.method === 'POST') rows = [JSON.parse(init.body)];
    return Response.json(rows);
  };
  try {
    const service = new TeamProposalsService();
    const result = { plan: parseTeamPlan({understood:true,rationale:'Equipo',items:[{id:'r-cm',hours:10,cadence:'monthly'}]}), provenance:{provider:'Meta',model:'muse-test',responseId:'msg-one'} };
    const saved = await service.save('token','owner-a','Mi equipo','es',result);
    const found = await service.list('token','owner-a');
    assert.equal(found[0].id,saved.id); assert.equal(found[0].plan.monthlyTotal,779);
    assert.equal(typeof found[0].plan.items[0].name,'string');
    assert.ok(calls.every(c=>c.url.includes('/rest/v1/team_proposals')));
    assert.ok(calls.filter(c=>c.init.method==='GET').every(c=>new URL(c.url).searchParams.get('owner_id')==='eq.owner-a'));
    await assert.rejects(service.list('token','owner-b'));
    rows[0].document = rows[0].document.replace('779','1');
    await assert.rejects(service.list('token','owner-a'));
    delete process.env.TEAM_PROPOSAL_SIGNING_KEY;
    const count=calls.length; await assert.rejects(service.ready('token','owner-a')); assert.equal(calls.length,count);
  } finally { global.fetch=real; }
});
