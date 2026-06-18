const mockEncryptionService = {
  encrypt: jest.fn(value => `ENC[${value}]`),
  decrypt: jest.fn(value => String(value).replace(/^ENC\[|\]$/g, ''))
};

jest.mock('../../src/services/brokerSync/encryptionService', () => mockEncryptionService);

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');

describe('BrokerConnection Alpaca multi-account support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({
      rows: [{
        id: 'conn-1',
        user_id: 'user-1',
        broker_type: 'alpaca',
        connection_status: 'pending',
        account_label: 'Paper A',
        auto_sync_enabled: false,
        sync_frequency: 'daily',
        sync_time: '06:00:00',
        broker_environment: 'paper',
        external_account_id: 'alpaca-account-a',
        external_user_id: null,
        broker_metadata: { accountNumber: '****1234' },
        alpaca_auth_type: 'api_key',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z')
      }]
    });
  });

  test('uses Alpaca account id, not only environment, as the upsert conflict target', async () => {
    await BrokerConnection.create('user-1', {
      brokerType: 'alpaca',
      brokerEnvironment: 'paper',
      externalAccountId: 'alpaca-account-a',
      accountLabel: 'Paper A',
      alpacaAuthType: 'api_key',
      alpacaApiKeyId: 'PK-1',
      alpacaApiSecret: 'SECRET-1'
    });

    const query = db.query.mock.calls[0][0];

    expect(query).toContain('alpaca_api_key_id');
    expect(query).toContain('alpaca_api_secret');
    expect(query).toContain('alpaca_auth_type');
    expect(query).toContain("ON CONFLICT (user_id, (COALESCE(broker_environment, 'live')), external_account_id)");
    expect(query).toContain("WHERE broker_type = 'alpaca' AND external_account_id IS NOT NULL");
    expect(query).not.toContain("ON CONFLICT (user_id, (COALESCE(broker_environment, 'live'))) WHERE broker_type = 'alpaca'");
  });

  test('encrypts Alpaca API key credentials before persisting', async () => {
    await BrokerConnection.create('user-1', {
      brokerType: 'alpaca',
      brokerEnvironment: 'paper',
      externalAccountId: 'alpaca-account-a',
      alpacaAuthType: 'api_key',
      alpacaApiKeyId: 'PK-1',
      alpacaApiSecret: 'SECRET-1'
    });

    expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('PK-1');
    expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('SECRET-1');

    const params = db.query.mock.calls[0][1];
    expect(params).toContain('ENC[PK-1]');
    expect(params).toContain('ENC[SECRET-1]');
    expect(params).toContain('api_key');
  });

  test('does not expose Alpaca API-key credentials unless includeCredentials is true', () => {
    const publicConnection = BrokerConnection.formatConnection({
      id: 'conn-1',
      user_id: 'user-1',
      broker_type: 'alpaca',
      account_label: 'Paper A',
      connection_status: 'active',
      broker_environment: 'paper',
      external_account_id: 'alpaca-account-a',
      broker_metadata: { accountNumber: '****1234' },
      alpaca_auth_type: 'api_key',
      alpaca_api_key_id: 'ENC[PK-1]',
      alpaca_api_secret: 'ENC[SECRET-1]'
    }, false);

    expect(publicConnection.alpacaAuthType).toBe('api_key');
    expect(publicConnection.alpacaApiKeyId).toBeUndefined();
    expect(publicConnection.alpacaApiSecret).toBeUndefined();

    const privateConnection = BrokerConnection.formatConnection({
      id: 'conn-1',
      user_id: 'user-1',
      broker_type: 'alpaca',
      account_label: 'Paper A',
      connection_status: 'active',
      broker_environment: 'paper',
      external_account_id: 'alpaca-account-a',
      broker_metadata: { accountNumber: '****1234' },
      alpaca_auth_type: 'api_key',
      alpaca_api_key_id: 'ENC[PK-1]',
      alpaca_api_secret: 'ENC[SECRET-1]'
    }, true);

    expect(privateConnection.alpacaAuthType).toBe('api_key');
    expect(privateConnection.alpacaApiKeyId).toBe('PK-1');
    expect(privateConnection.alpacaApiSecret).toBe('SECRET-1');
  });
});
