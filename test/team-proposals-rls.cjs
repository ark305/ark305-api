const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const fs = require('node:fs');
const name='ark-team-rls-'+randomBytes(8).toString('hex');
const host=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const docker=(args,input)=>spawnSync('docker',['--host',host,...args],{input,encoding:'utf8',timeout:30000,windowsHide:true});
function ok(r){assert.ifError(r.error);assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
const sql=(s)=>docker(['exec','-i',name,'psql','-U','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],s);
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const as=(id,role='authenticated')=>`set role ${role};set request.jwt.claim.sub='${id}';`;
const insert=(id,owner)=>`insert into public.team_proposals values('${id}','${owner}',now(),'{}',repeat('a',64));`;
const hash=()=>ok(sql('select md5(coalesce(jsonb_agg(t)::text,\'[]\')) from public.team_proposals t;'));
function reject(s){const before=hash();const r=sql(s);assert.equal(r.status,3,r.stderr);assert.match(r.stderr,/ERROR:/);assert.equal(hash(),before);}
(async()=>{
  ok(docker(['image','inspect','postgres:17']));
  ok(docker(['run','--pull=never','--rm','-d','--name',name,'-e',`POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`,'postgres:17']));
  try{
    let ready=false;for(let i=0;i<30;i++){if(docker(['exec',name,'pg_isready','-U','postgres']).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
    ok(sql(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;`));
    ok(sql(fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20261104041549_team_proposals.sql'),'utf8')));
    ok(sql(as(a)+insert(a,a)));ok(sql(as(b)+insert(b,b)));
    assert.equal(ok(sql(as(a)+'select count(*) from public.team_proposals;')),'1');
    assert.equal(ok(sql(as(b)+'select count(*) from public.team_proposals;')),'1');
    assert.equal(ok(sql(as(b)+`select count(*) from public.team_proposals where id='${a}';`)),'0');
    reject(as(b)+insert('33333333-3333-4333-8333-333333333333',a));
    reject(as(a)+insert(a,a));
    reject(as(a)+`update public.team_proposals set document='changed';`);
    reject(as(a)+'delete from public.team_proposals;');
    reject(as('','anon')+'select * from public.team_proposals;');
    reject(as('','anon')+insert('44444444-4444-4444-8444-444444444444',a));
    console.log('PASS: owner-only select/insert, foreign rows hidden, duplicate rejected, immutable rows, anonymous denied; rejected operations preserve data hash.');
  }finally{ok(docker(['rm','-f',name]));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
