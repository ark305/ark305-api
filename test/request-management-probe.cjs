const assert = require('node:assert/strict');

module.exports = async function ({ sql, expectValue, setIdentity, concurrentSql, ownerA, ownerB }) {
  const admin = '55555555-5555-4555-8555-555555555555';
  const hash = () => sql(`SELECT md5(jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.service_requests r),
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.service_request_events e),
    (SELECT jsonb_agg(to_jsonb(a)) FROM public.request_administrators a))::text);`, 'hash requests and history');
  const rejected = (statement, label) => {
    const before = hash(); sql(statement, label, false);
    assert.equal(hash(), before, label);
    process.stdout.write(`PASS ${label}\n`);
  };
  expectValue('SELECT count(*) FROM public.request_administrators;', '0', 'migration grants no implicit administrator');
  sql(`INSERT INTO auth.users VALUES ('${admin}');
    INSERT INTO public.request_administrators (user_id) VALUES ('${admin}');`, 'provision local test administrator');
  rejected(`INSERT INTO public.request_administrators (user_id) VALUES ('${ownerA}');`, 'only one administrator');
  rejected(setIdentity(ownerA) + `INSERT INTO public.request_administrators (user_id) VALUES ('${ownerA}');`, 'client cannot self-promote');
  rejected(setIdentity(admin) + 'DELETE FROM public.request_administrators;', 'app administrator cannot alter role registry');
  expectValue(setIdentity(ownerA) + 'SELECT count(*) FROM public.request_administrators;', '0', 'client cannot read administrator identity');
  expectValue(setIdentity(admin) + 'SELECT count(*) FROM public.service_requests;', '2', 'administrator sees inbox');
  expectValue(setIdentity(ownerA) + 'SELECT count(*) FROM public.service_requests;', '1', 'client still sees only own request');
  const id = sql(`SELECT id FROM public.service_requests WHERE requester_id='${ownerA}';`, 'get test request');
  const update = (from, to) => `WITH changed AS (UPDATE public.service_requests SET status='${to}' WHERE id='${id}' AND status='${from}' RETURNING id) SELECT count(*) FROM changed;`;
  const before = hash();
  expectValue(setIdentity(ownerA) + update('received', 'in_progress'), '0', 'client cannot change status');
  assert.equal(hash(), before);
  rejected(setIdentity(admin) + update('received', 'closed'), 'administrator cannot skip stages');
  rejected(setIdentity(admin) + "UPDATE public.service_requests SET preferences='tampered';", 'administrator cannot modify customer details');
  const outcomes = await Promise.all([
    concurrentSql(setIdentity(admin) + update('received', 'in_progress')),
    concurrentSql(setIdentity(admin) + update('received', 'in_progress')),
  ]);
  assert.deepEqual(outcomes.sort(), ['0', '1'], 'concurrent expected-state updates have one winner');
  expectValue(`SELECT count(*) FROM public.service_request_events WHERE request_id='${id}';`, '1', 'one transition creates one event');
  expectValue(setIdentity(ownerA) + 'SELECT from_status || \'→\' || to_status FROM public.service_request_events;', 'received→in_progress', 'client sees own history');
  expectValue(setIdentity(ownerB) + 'SELECT count(*) FROM public.service_request_events;', '0', 'other client cannot read history');
  expectValue(`SELECT actor_id::text FROM public.service_request_events WHERE request_id='${id}';`, admin, 'actor comes from verified identity');
  rejected(setIdentity(admin) + 'DELETE FROM public.service_request_events;', 'history cannot be deleted through app');
  rejected(setIdentity(admin) + `INSERT INTO public.service_request_events (request_id,from_status,to_status,actor_id) VALUES ('${id}','in_progress','closed','${ownerA}');`, 'history cannot be forged');
  sql(`CREATE FUNCTION public.fail_test_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$;
    CREATE TRIGGER fail_test_event BEFORE INSERT ON public.service_request_events FOR EACH ROW EXECUTE FUNCTION public.fail_test_event();`, 'install isolated audit failure');
  rejected(setIdentity(admin) + update('in_progress', 'closed'), 'audit failure rolls back status and event');
  sql('DROP TRIGGER fail_test_event ON public.service_request_events; DROP FUNCTION public.fail_test_event();', 'remove test failure');
  expectValue(setIdentity(admin) + update('in_progress', 'closed'), '1', 'administrator closes request');
  rejected(setIdentity(admin) + update('closed', 'in_progress'), 'closed requests cannot reopen');
  rejected(setIdentity(admin) + update('closed', 'closed'), 'repeated transitions rejected');
  expectValue(setIdentity(admin) + `WITH changed AS (UPDATE public.service_requests SET status='cancelled' WHERE requester_id='${ownerB}' RETURNING id) SELECT count(*) FROM changed;`, '1', 'received request can be cancelled');
  rejected(setIdentity(admin) + `UPDATE public.service_requests SET status='in_progress' WHERE requester_id='${ownerB}';`, 'cancelled request cannot reopen');
  for (const table of ['request_administrators', 'service_request_events']) {
    rejected(setIdentity(null, 'anon') + `SELECT * FROM public.${table};`, `anonymous cannot read ${table}`);
  }
  sql(setIdentity(ownerA) + "INSERT INTO public.service_requests (service_id,requested_date,guests) VALUES ('jet-ski','2027-01-15',2);", 'create cancellation test');
  sql(setIdentity(admin) + "UPDATE public.service_requests SET status='in_progress' WHERE service_id='jet-ski';", 'start cancellation test');
  expectValue(setIdentity(admin) + "WITH changed AS (UPDATE public.service_requests SET status='cancelled' WHERE service_id='jet-ski' AND status='in_progress' RETURNING id) SELECT count(*) FROM changed;", '1', 'in-progress request can be cancelled');
  sql('DELETE FROM public.request_administrators;', 'revoke test administrator');
  expectValue(setIdentity(admin) + 'SELECT count(*) FROM public.service_requests;', '0', 'revocation takes effect without changing JWT');
};
