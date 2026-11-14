# Provider approval

`profiles.kind = 'provider'` can no longer be self-assigned. Members apply; an operator (a `request_administrators` user) approves or rejects.

Migration: `supabase/migrations/20261114020000_provider_approval.sql` (requires `20261102232604_request_management.sql`).

## Enforcement

- Trigger `profiles_provider_kind_guard` rejects any `anon`/`authenticated` insert or update that sets `kind = 'provider'` on a profile that is not already a provider. Users can still edit other fields, move between non-provider kinds, or stop being a provider (which needs a fresh approval to undo).
- `provider_applications` holds one row per user (`pending` | `approved` | `rejected`). Users read their own row and operators read all. Nobody can write it directly.
- `request_provider_role()` files or re-opens the caller's application. `decide_provider_application(applicant, approve)` is operator-only and is the only path that sets `kind = 'provider'`. Both are `security definer` with an empty `search_path`.
- Existing provider profiles are kept as they are.

## API (`/api/v1/profiles`, all authenticated)

| Route | Who | Result |
| --- | --- | --- |
| `POST /me`, `PATCH /me` with `kind: "provider"` | any user | Saves the profile with its current kind (`member` for new profiles), files an application, and returns `providerApplication` |
| `GET /me/provider-application` | any user | `{ application }`, or `null` if the user never applied |
| `POST /me/provider-application` | non-provider with a profile | `{ application }` (idempotent). Returns 409 if the user is already a provider and 400 if they have no profile |
| `GET /provider-applications?status=pending` | operator | `{ items }`, oldest first, with `profile { handle, name, kind }`. `status` can be `pending` (default), `approved` or `rejected` |
| `POST /provider-applications/:userId/approve` / `reject` | operator | `{ application }`. Returns 404 if there is no pending application |

## Tests

- `npm test` runs `test/provider-approval.test.mjs` (service, migration structure, HTTP flow).
- `node test/provider-approval-rls.cjs` is an optional probe against an isolated local `postgres:17` image.
