import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MetaAdapter } from '../dist/modules/ai/meta.adapter.js';
import { catalogTools, queryCatalog } from '../dist/modules/ai/catalog-tools.js';
import { DemoCatalogAdapter } from '../dist/modules/catalog/demo-catalog.adapter.js';

test('Meta catalog tools execute provider calls, not text claims, in ES and EN', async (t) => {
  const previous = { MODEL_API_KEY: process.env.MODEL_API_KEY, META_BASE_URL: process.env.META_BASE_URL };
  Object.assign(process.env, { MODEL_API_KEY: 'private-fixture', META_BASE_URL: 'https://api.meta.ai' });
  const realFetch = global.fetch;
  t.after(() => { global.fetch = realFetch; for (const [k,v] of Object.entries(previous)) v === undefined ? delete process.env[k] : process.env[k] = v; });
  const adapter = new MetaAdapter(), catalog = new DemoCatalogAdapter();
  for (const locale of ['es', 'en']) {
    const calls = [];
    global.fetch = async (url, init) => {
      assert.equal(new URL(url).origin, 'https://api.meta.ai');
      assert.equal(init.headers.Authorization, 'Bearer private-fixture');
      const body = JSON.parse(init.body); calls.push({ body, signal: init.signal });
      return Response.json(calls.length === 1 ?
        {stop_reason:'tool_use',content:[{type:'tool_use',id:'call_catalog',name:'search_catalog',input:{query:'water'}}]} :
        {stop_reason:'end_turn',model:'muse-test',id:'msg-result',content:[{type:'text',text:'{}'}]});
    };
    const result = await adapter.catalogPlan('system', 'marina', {}, catalogTools(), (name,input) => queryCatalog(catalog,name,input,locale));
    assert.equal(calls.length,2);
    assert.equal(calls[0].signal,calls[1].signal);
    assert.equal(calls[0].body.tool_choice.type,'auto');
    assert.equal(calls[1].body.tool_choice,undefined); assert.equal(calls[1].body.tools,undefined);
    assert.equal(calls[1].body.messages[1].content[0].id,'call_catalog');
    const returned = calls[1].body.messages[2].content[0];
    assert.equal(returned.tool_use_id,'call_catalog');
    const facts = JSON.parse(returned.content);
    assert.equal(facts.source,'demo'); assert.equal(facts.bookable,false);
    assert.equal(facts.availability,'unverified');
    assert.ok(facts.services.some(s=>s.id==='yacht'));
    assert.equal(facts.services.find(s=>s.id==='yacht').name,locale==='en'?'50 ft yacht':'Yate 50 ft');
    assert.equal(facts.services.find(s=>s.id==='yacht').estimate.amount,700);
    assert.equal(result.evidence[0].name,'search_catalog');
  }
  await t.test('unknown service returns an empty real catalog result', async()=>{
    const result=await queryCatalog(catalog,'search_catalog',{query:'submarine-to-mars'},'en');
    assert.deepEqual(result.services,[]);
    const addons=await queryCatalog(catalog,'get_complements',{serviceId:'yacht'},'es','yacht');
    assert.deepEqual(addons.services.map(s=>s.id).sort(),['bottles','chef','photographer']);
    await assert.rejects(queryCatalog(catalog,'get_complements',{serviceId:'villa'},'en','yacht'));
    await assert.rejects(queryCatalog(catalog,'create_request',{query:'water'},'en'));
  });
  for (const bad of [
    {stop_reason:'end_turn',content:[{type:'text',text:'I queried the catalog'}]},
    {stop_reason:'tool_use',content:[{type:'tool_use',id:'x',name:'create_request',input:{query:'water'}}]},
    {stop_reason:'tool_use',content:[{type:'tool_use',id:'x',name:'search_catalog',input:{query:'water',sql:'secret'}}]},
    {stop_reason:'max_tokens',content:[]},
  ]) {
    let count=0; global.fetch=async()=>{count++;return Response.json(bad);};
    await assert.rejects(adapter.catalogPlan('s','p',{},catalogTools(),(n,i)=>queryCatalog(catalog,n,i,'en')),
      e=>e.getStatus()===502);
    assert.equal(count,1);
  }
  for (const status of [429,500]) {
    global.fetch=async()=>Response.json({secret:'never disclose'}, {status});
    await assert.rejects(adapter.catalogPlan('s','p',{},catalogTools(),()=>assert.fail('no tool on provider error')),
      e=>e.getStatus()===(status===429?429:502) && !JSON.stringify(e.getResponse()).includes('secret'));
  }
  global.fetch=async()=>{throw new DOMException('Timeout','TimeoutError');};
  await assert.rejects(adapter.catalogPlan('s','p',{},catalogTools(),()=>assert.fail()),e=>e.getStatus()===502);
  delete process.env.MODEL_API_KEY;
  await assert.rejects(adapter.catalogPlan('s','p',{},catalogTools(),()=>assert.fail()),e=>e.getStatus()===503);
});
