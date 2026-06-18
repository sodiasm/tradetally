-- Migration: Allow multiple Alpaca API-key connections per user
--
-- Previous behavior limited Alpaca to one connection per user/environment
-- via idx_broker_connections_user_alpaca_environment. That prevents a user
-- from syncing multiple Alpaca live accounts or multiple Alpaca paper accounts.
--
-- New behavior keys Alpaca uniqueness by the broker account returned by
-- Alpaca /v2/account, while preserving the environment dimension.

ALTER TABLE broker_connections
  ADD COLUMN IF NOT EXISTS alpaca_api_key_id TEXT,
  ADD COLUMN IF NOT EXISTS alpaca_api_secret TEXT,
  ADD COLUMN IF NOT EXISTS alpaca_auth_type VARCHAR(20) DEFAULT 'oauth';

ALTER TABLE broker_connections
  DROP CONSTRAINT IF EXISTS broker_connections_alpaca_auth_type_check;

ALTER TABLE broker_connections
  ADD CONSTRAINT broker_connections_alpaca_auth_type_check
  CHECK (
    alpaca_auth_type IS NULL
    OR alpaca_auth_type IN ('oauth', 'api_key')
  );

DROP INDEX IF EXISTS idx_broker_connections_user_alpaca_environment;

CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_connections_user_alpaca_account
  ON broker_connections (user_id, COALESCE(broker_environment, 'live'), external_account_id)
  WHERE broker_type = 'alpaca' AND external_account_id IS NOT NULL;

COMMENT ON COLUMN broker_connections.alpaca_api_key_id IS 'Encrypted Alpaca API key id for API-key based connections';
COMMENT ON COLUMN broker_connections.alpaca_api_secret IS 'Encrypted Alpaca API secret for API-key based connections';
COMMENT ON COLUMN broker_connections.alpaca_auth_type IS 'Alpaca auth mode: oauth or api_key';
