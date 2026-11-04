import subprocess, pathlib, time, concurrent.futures, uuid, atexit
C='ark-addon-test-'+uuid.uuid4().hex[:12]
root=pathlib.Path(__file__).resolve().parents[1]
# Explicit opt-in integration test: isolated local database, never a project database.
subprocess.run(['docker','run','-d','--rm','--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','--name',C,'postgres:16-alpine'],check=True,capture_output=True)
atexit.register(lambda: subprocess.run(['docker','rm','-f',C],capture_output=True))
def sql(q, good=True):
 p=subprocess.run(['docker','exec','-i',C,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-At'],input=q,text=True,capture_output=True)
 if good and p.returncode: raise AssertionError(p.stderr)
 if not good and not p.returncode: raise AssertionError('unexpected SQL success')
 return p.stdout.strip(),p.stderr
for i in range(30):
 p=subprocess.run(['docker','exec',C,'pg_isready','-U','postgres'],capture_output=True)
 if p.returncode==0: break
 time.sleep(1)
sql('''create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;''')
for f in ['20261031031940_service_requests.sql','20261102232604_request_management.sql','20261104162321_request_addons.sql']:
 sql((root/'supabase/migrations'/f).read_text()); print('APPLIED isolated '+f)
O='11111111-1111-4111-8111-111111111111'; F='22222222-2222-4222-8222-222222222222'; A='33333333-3333-4333-8333-333333333333'
R='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; X='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; Y='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
sql(f"insert into auth.users values ('{O}'),('{F}'),('{A}'); insert into public.request_administrators(user_id) values('{A}'); insert into public.service_requests(id,requester_id,service_id,requested_date,guests,status) values ('{R}','{O}','yacht','2027-01-15',4,'received'),('{X}','{O}','yacht','2027-01-15',4,'closed'),('{Y}','{F}','yacht','2027-01-15',4,'received');")
def asuser(uid,q,good=True): return sql(f"set role authenticated; set request.jwt.claim.sub='{uid}'; "+q,good)
def ins(r,s='chef',extra=''): return f"insert into public.service_request_addons(request_id,service_id{',qty' if extra else ''}) values('{r}','{s}'{','+extra if extra else ''});"
def snapshot(): return sql("select md5(coalesce(string_agg(row_to_json(t)::text,',' order by id),'')) from public.service_request_addons t;")[0]
def reject(label,uid,q):
 before=snapshot(); _,err=asuser(uid,q,False); assert snapshot()==before; print('PASS rejection unchanged: '+label+' / '+err.splitlines()[0])
asuser(O,ins(R)); print('PASS owner insert')
assert asuser(O,'select count(*) from public.service_request_addons;')[0].splitlines()[-1]=='1'
assert asuser(F,'select count(*) from public.service_request_addons;')[0].splitlines()[-1]=='0'
assert asuser(A,'select count(*) from public.service_request_addons;')[0].splitlines()[-1]=='1'; print('PASS owner/foreign/admin SELECT visibility')
reject('foreign inserts owner request',F,ins(R,'bottles'))
reject('owner inserts foreign request',O,ins(Y))
reject('admin cannot accept for owner',A,ins(R,'bottles'))
reject('incompatible complement',O,ins(R,'villa'))
reject('inactive request',O,ins(X))
reject('explicit qty even 1 denied by column grant',O,ins(R,'bottles','1'))
reject('arbitrary accepted_at denied',O,f"insert into public.service_request_addons(request_id,service_id,accepted_at) values('{R}','bottles',now());")
reject('update forbidden',O,'update public.service_request_addons set service_id=\'bottles\';')
reject('delete forbidden',O,'delete from public.service_request_addons;')
for q in ['select * from public.service_request_addons;',ins(R,'bottles')]:
 before=snapshot(); sql('set role anon; '+q,False); assert before==snapshot()
print('PASS anonymous read/write denied')
before=snapshot(); asuser(O,f"insert into public.service_request_addons(request_id,service_id) values('{R}','chef') on conflict(request_id,service_id) do nothing returning *;"); assert before==snapshot(); print('PASS duplicate DO NOTHING preserves original row')
# Hold an administrative cancellation uncommitted. Acceptance must block, then reject latest status.
def cancel(): return asuser(A,f"begin; update public.service_requests set status='cancelled' where id='{R}'; select pg_sleep(2); commit;")
with concurrent.futures.ThreadPoolExecutor() as pool:
 future=pool.submit(cancel)
 for _ in range(40):
  out,_=sql("select count(*) from pg_stat_activity where query like '%select pg_sleep(2)%' and wait_event='PgSleep';")
  if out=='1': break
  time.sleep(.05)
 else: raise AssertionError('cancellation not synchronized')
 start=time.monotonic(); before=snapshot(); _,err=asuser(O,ins(R,'bottles'),False); elapsed=time.monotonic()-start; future.result(); assert elapsed>1 and before==snapshot() and 'no longer active' in err
print('PASS concurrent parent cancellation blocks acceptance %.2fs then rejects without write'%elapsed)
print('ALL SQL PROBES PASSED')
