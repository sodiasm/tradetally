# TradeTally Multi-Alpaca Sync Checkpoint

Date: 2026-06-18
Repo: `/home/ubuntu/tt-multi-alpaca`
Branch: `feat/multi-alpaca-phase1`
Base commit: `d614e6c2 aiProvider: add fetch timeout (AbortController) + reasoning model support`

## Goal

Make TradeTally natively support **true multiple Alpaca account sync** for one user.

Target behavior:

- One TradeTally user can connect multiple Alpaca paper accounts.
- One TradeTally user can connect multiple Alpaca live accounts.
- Each Alpaca account has its own stored credentials, label, sync settings, sync logs, and synced trades.
- Sync duplicate detection must not skip trades from another Alpaca account just because symbol/date/qty/price are the same.
- Credentials must be encrypted at rest and never returned in public API responses.

## Production safety status

No production deployment has been changed yet.

- No push to GitHub fork yet.
- No GHCR image rebuild yet.
- No Zeabur/K3s rollout yet.
- No production DB migration executed yet.
- The provided real Alpaca paper keys were not written to repo files.

Secret safety check performed after code changes:

```text
OK: no provided real Alpaca keys found in repo files
```

## What was implemented

### Commit 1

```text
c8b8663a feat: allow multiple Alpaca broker connections
```

Files:

- `backend/src/models/BrokerConnection.js`
- `backend/migrations/211_allow_multiple_alpaca_api_key_connections.sql`
- `backend/tests/models/brokerConnection.alpaca.test.js`

Changes:

- Added encrypted Alpaca API-key fields to `broker_connections`:
  - `alpaca_api_key_id`
  - `alpaca_api_secret`
  - `alpaca_auth_type`
- Added auth type constraint:
  - `oauth`
  - `api_key`
- Replaced old Alpaca uniqueness:

```sql
(user_id, COALESCE(broker_environment, 'live'))
```

with account-level uniqueness:

```sql
(user_id, COALESCE(broker_environment, 'live'), external_account_id)
WHERE broker_type = 'alpaca' AND external_account_id IS NOT NULL
```

- Updated `BrokerConnection.create()` to support Alpaca API-key credentials.
- Updated `formatConnection()` so public responses expose only `alpacaAuthType`; decrypted credentials are only available internally with `includeCredentials=true`.

### Commit 2

```text
12a8b8d2 feat: support Alpaca API key authentication
```

Files:

- `backend/src/services/brokerSync/alpacaService.js`
- `backend/tests/services/brokerSync.alpaca.apiKey.test.js`

Changes:

- Added `getAccountWithApiKey(apiKeyId, apiSecret, environment)`.
- Added Alpaca API-key headers:

```http
APCA-API-KEY-ID
APCA-API-SECRET-KEY
```

- Added `getHeadersForConnection()` so:
  - `alpacaAuthType === 'api_key'` uses API-key headers.
  - OAuth connections keep existing `Authorization: Bearer ...` behavior.
- Overrode `ensureValidToken()` for API-key connections so OAuth refresh is bypassed.
- Kept existing OAuth Alpaca flow compatible.

### Commit 3

```text
af57f010 fix: scope broker sync duplicate detection by connection
```

Files:

- `backend/src/services/brokerSync/oauthBrokerBase.js`
- `backend/tests/services/brokerSync.tradestation.mapping.test.js`

Changes:

- `importTrades()` now fetches existing trades scoped to the current `broker_connection_id`.
- `getExistingTrades()` now accepts optional `connectionId` and adds:

```sql
AND broker_connection_id = $n
```

- Newly imported in-memory trades also retain `broker_connection_id`.
- Added an `account_identifier` guard inside `isDuplicateTrade()` so trades from different account identifiers are not treated as duplicates.

Reason:

Without this, two Alpaca accounts could produce identical-looking trades and the second account's trades could be silently skipped as duplicates.

### Commit 4

```text
63bab326 feat: add Alpaca API key connection endpoint
```

Files:

- `backend/src/controllers/brokerSync.controller.js`
- `backend/src/routes/brokerSync.routes.js`
- `backend/src/middleware/validation.js`
- `backend/tests/controllers/brokerSync.alpacaApiKey.test.js`
- `backend/tests/middleware/validation.brokerSyncAlpaca.test.js`
- `backend/tests/routes/brokerSync.rate-limit.test.js`

Changes:

Added backend endpoint:

```http
POST /api/broker-sync/connections/alpaca/api-key
```

Request body:

```json
{
  "environment": "paper",
  "accountLabel": "Strategy A Paper",
  "apiKeyId": "PK...",
  "apiSecret": "...",
  "autoSyncEnabled": false,
  "syncFrequency": "daily",
  "syncTime": "06:00:00",
  "syncStartDate": "2026-01-01"
}
```

Controller behavior:

1. Checks broker-sync access / Pro permission.
2. Calls Alpaca `/v2/account` using API-key headers.
3. Extracts `externalAccountId` from `account.id || account.account_number`.
4. Creates/updates Alpaca broker connection through `BrokerConnection.create()`.
5. Stores encrypted credentials.
6. Marks connection active.
7. Returns sanitized connection without API key or secret.

Invalid Alpaca credentials return:

```json
{
  "success": false,
  "error": "Invalid Alpaca API credentials"
}
```

HTTP status: `400`.

## Test results

Latest targeted regression run:

```text
PASS tests/controllers/brokerSync.oauth-state.test.js
PASS tests/middleware/validation.brokerSyncAlpaca.test.js
PASS tests/controllers/brokerSync.alpacaApiKey.test.js
PASS tests/services/brokerSync.schwab.mapping.test.js
PASS tests/services/brokerSync.alpaca.apiKey.test.js
PASS tests/services/brokerSync.tradestation.mapping.test.js
PASS tests/models/brokerConnection.alpaca.test.js
PASS tests/routes/brokerSync.rate-limit.test.js

Test Suites: 8 passed
Tests: 58 passed
```

Syntax checks passed:

```bash
node --check src/models/BrokerConnection.js
node --check src/services/brokerSync/alpacaService.js
node --check src/services/brokerSync/oauthBrokerBase.js
node --check src/controllers/brokerSync.controller.js
node --check src/routes/brokerSync.routes.js
node --check src/middleware/validation.js
```

## Not done yet

### Not yet deployed

The local branch has not been pushed or deployed.

Needed for deployment:

1. Push branch/commits to `sodiasm/tradetally`.
2. Build new ARM64 image.
3. Push `ghcr.io/sodiasm/tradetally:v4`.
4. Rollout restart Zeabur-managed v2 app:

```bash
sudo kubectl rollout restart deploy/service-6a2ececf125703f5be36532a -n environment-6a0eaf90f3b70f2a79fbdb0a
```

5. Verify new pod image digest and health.

### Not yet migrated in production DB

Migration not yet executed on v2 DB:

```text
backend/migrations/211_allow_multiple_alpaca_api_key_connections.sql
```

It should run via app startup migration after deploy if `RUN_MIGRATIONS=true`, but verify explicitly after rollout.

Expected DB verification after deploy:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'broker_connections'
  AND column_name IN ('alpaca_api_key_id', 'alpaca_api_secret', 'alpaca_auth_type');

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'broker_connections'
  AND indexname LIKE '%alpaca%';
```

Expected:

- New Alpaca API-key columns exist.
- Old index `idx_broker_connections_user_alpaca_environment` is gone.
- New index `idx_broker_connections_user_alpaca_account` exists.

### Frontend UI not done

No frontend changes yet.

Current backend endpoint can be called directly with API/JWT. UI work can be added later.

Potential frontend work:

- Add Alpaca API-key connection form in Broker Sync settings.
- Allow multiple Alpaca rows in connection list.
- Show account label, environment, masked account number, status, last sync.
- Add per-connection sync/delete/test buttons.

### Real Alpaca paper-account POC not done

User provided two Alpaca paper account credentials for testing, but they have not been used yet.

Recommended POC after deploy or hot-patch:

1. Choose target TradeTally user, likely `alice.sync@hermesbot.com` or another explicit user.
2. Obtain JWT for that user.
3. POST account 1 to:

```http
POST /api/broker-sync/connections/alpaca/api-key
```

4. POST account 2 to the same endpoint.
5. Verify DB has two rows for same user/environment:

```sql
SELECT broker_environment, external_account_id, account_label, connection_status
FROM broker_connections
WHERE broker_type = 'alpaca'
ORDER BY created_at;
```

6. Trigger manual sync per connection:

```http
POST /api/broker-sync/connections/<connection_id>/sync
```

7. Verify trades are separated:

```sql
SELECT broker_connection_id, account_identifier, count(*)
FROM trades
WHERE user_id = '<user_id>'
GROUP BY broker_connection_id, account_identifier
ORDER BY count(*) DESC;
```

## Recommended next step

Recommended next step is **persistent deploy**, not hot-patch.

Reason:

- Changes span migration, model, service, controller, route, and validation.
- Hot-patching risks missing migration or restarting only part of the code path.
- The code now has tests and local commits; safer to rebuild image and deploy cleanly.

Suggested next sequence:

1. Push branch to GitHub fork.
2. Backup current GHCR image tag.
3. Build/push new `ghcr.io/sodiasm/tradetally:v4`.
4. Rollout v2 app.
5. Verify migration ran.
6. Use the two Alpaca paper accounts for backend-only POC.
7. Decide whether frontend UI is needed immediately or later.

## Rollback note

Before pushing a new image to `:v4`, create a backup tag of the current running image, e.g.:

```bash
docker pull ghcr.io/sodiasm/tradetally:v4
docker tag ghcr.io/sodiasm/tradetally:v4 ghcr.io/sodiasm/tradetally:v4-bak-pre-multi-alpaca
docker push ghcr.io/sodiasm/tradetally:v4-bak-pre-multi-alpaca
```

Rollback command after deployment if needed:

```bash
sudo kubectl set image deploy/service-6a2ececf125703f5be36532a \
  tradetally=ghcr.io/sodiasm/tradetally:v4-bak-pre-multi-alpaca \
  -n environment-6a0eaf90f3b70f2a79fbdb0a
```
