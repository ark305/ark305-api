# Live provider tracking

`src/modules/tracking` stores the latest GPS position of each provider in Supabase (`public.provider_locations`, migration `supabase/migrations/20261114010000_provider_locations.sql`). It reuses the existing Supabase configuration (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) and the caller's JWT; no new environment variables.

## Routes (all under `/api/v1`, all require `Authorization: Bearer <token>`)

| Route | Who | Behaviour |
| --- | --- | --- |
| `POST /tracking/location` | Users whose profile has `kind = 'provider'` | Body `{ latitude, longitude, accuracy?, onDuty? }` (`onDuty` defaults to `true`). Upserts the caller's single row; the owner always comes from the token and `recorded_at` from the database clock. Other users get 403. |
| `GET /tracking/nearby?latitude=&longitude=&radiusKm=` | Any signed-in user | On-duty providers seen in the last 15 minutes within `radiusKm` (default 5, max 50), nearest first, at most 50. Operators get exact distance and coordinates; everyone else gets provider id, distance rounded to 0.1 km (computed from a ~1 km grid cell) and no coordinates. |
| `GET /tracking/locations` | Operators (`request_administrators`) | Every stored position (up to 500) with `stale` and `available` flags. Others get 403. |

Positions are never deleted by the API: a provider that stops reporting simply becomes stale after 15 minutes, and `onDuty: false` removes them from nearby results immediately.

## Tests

- `npm test` includes `test/tracking.test.mjs` (service, parsing, HTTP routes against a fake Supabase, migration structure).
- `node test/tracking-rls.cjs` applies the migrations to an isolated local `postgres:17` container (no network, never pulls images) and checks RLS, upserts, staleness and the nearby function.
