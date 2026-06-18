jest.mock('../../src/models/BrokerConnection', () => ({
  create: jest.fn(),
  updateStatus: jest.fn(),
  update: jest.fn(),
  calculateNextSync: jest.fn(() => new Date('2026-01-02T06:00:00Z')),
  findById: jest.fn()
}));

jest.mock('../../src/models/Account', () => ({
  create: jest.fn(),
  findByUser: jest.fn(),
  getEarliestTradeDate: jest.fn()
}));

jest.mock('../../src/services/brokerSync/alpacaService', () => ({
  getAccountWithApiKey: jest.fn()
}));

jest.mock('../../src/services/tierService', () => ({
  canCreateBrokerConnection: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  invalidate: jest.fn(),
  invalidateUserCache: jest.fn()
}));

jest.mock('../../src/services/optionStrategyGroupingService', () => ({
  rebuildUserGroupsSafe: jest.fn()
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const BrokerConnection = require('../../src/models/BrokerConnection');
const Account = require('../../src/models/Account');
const alpacaService = require('../../src/services/brokerSync/alpacaService');
const TierService = require('../../src/services/tierService');
const brokerSyncController = require('../../src/controllers/brokerSync.controller');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

describe('brokerSyncController.addAlpacaApiKeyConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TierService.canCreateBrokerConnection.mockResolvedValue({ allowed: true });
    alpacaService.getAccountWithApiKey.mockResolvedValue({
      id: 'alpaca-paper-account-1',
      account_number: 'PA12345678',
      status: 'ACTIVE'
    });
    BrokerConnection.create.mockResolvedValue({ id: 'connection-1' });
    BrokerConnection.updateStatus.mockResolvedValue();
    BrokerConnection.findById.mockResolvedValue({
      id: 'connection-1',
      userId: 'user-1',
      brokerType: 'alpaca',
      accountLabel: 'Strategy A Paper',
      brokerEnvironment: 'paper',
      externalAccountId: 'alpaca-paper-account-1',
      alpacaAuthType: 'api_key',
      connectionStatus: 'active'
    });
    Account.create.mockResolvedValue({ id: 'account-1' });
    Account.findByUser.mockResolvedValue([]);
    Account.getEarliestTradeDate.mockResolvedValue(null);
  });

  test('validates credentials with Alpaca, creates API-key broker connection, and returns sanitized connection', async () => {
    const req = {
      user: { id: 'user-1' },
      headers: { host: 'tradetally.local' },
      body: {
        environment: 'paper',
        accountLabel: 'Strategy A Paper',
        apiKeyId: 'PK-TEST',
        apiSecret: 'SECRET-TEST',
        autoSyncEnabled: true,
        syncFrequency: 'daily',
        syncTime: '06:00:00',
        syncStartDate: '2026-01-01'
      }
    };
    const res = createRes();
    const next = jest.fn();

    await brokerSyncController.addAlpacaApiKeyConnection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(alpacaService.getAccountWithApiKey).toHaveBeenCalledWith('PK-TEST', 'SECRET-TEST', 'paper');
    expect(BrokerConnection.create).toHaveBeenCalledWith('user-1', expect.objectContaining({
      brokerType: 'alpaca',
      alpacaAuthType: 'api_key',
      alpacaApiKeyId: 'PK-TEST',
      alpacaApiSecret: 'SECRET-TEST',
      brokerEnvironment: 'paper',
      externalAccountId: 'alpaca-paper-account-1',
      accountLabel: 'Strategy A Paper',
      autoSyncEnabled: true,
      syncFrequency: 'daily',
      syncTime: '06:00:00',
      syncStartDate: '2026-01-01'
    }));
    expect(BrokerConnection.create.mock.calls[0][1].brokerMetadata).toMatchObject({
      accountNumber: '****5678',
      status: 'ACTIVE',
      authType: 'api_key'
    });
    expect(BrokerConnection.updateStatus).toHaveBeenCalledWith(
      'connection-1',
      'active',
      'Alpaca API key connection successful'
    );
    expect(Account.create).toHaveBeenCalledWith('user-1', expect.objectContaining({
      accountName: 'Strategy A Paper',
      accountIdentifier: '****5678',
      broker: 'alpaca',
      initialBalance: 0,
      initialBalanceDate: expect.any(String),
      isPrimary: false,
      notes: expect.stringContaining('Alpaca broker sync connection')
    }));
    expect(res.statusCode).toBe(201);
    expect(res.payload).toMatchObject({
      success: true,
      message: 'Alpaca account added successfully',
      data: {
        id: 'connection-1',
        alpacaAuthType: 'api_key'
      }
    });
    expect(JSON.stringify(res.payload)).not.toContain('SECRET-TEST');
    expect(JSON.stringify(res.payload)).not.toContain('PK-TEST');
  });

  test('does not auto-create duplicate managed account when the Alpaca identifier already exists', async () => {
    Account.findByUser.mockResolvedValueOnce([
      { id: 'account-existing', account_identifier: '****5678' }
    ]);

    const req = {
      user: { id: 'user-1' },
      headers: { host: 'tradetally.local' },
      body: {
        environment: 'paper',
        accountLabel: 'Strategy A Paper',
        apiKeyId: 'PK-TEST',
        apiSecret: 'SECRET-TEST'
      }
    };
    const res = createRes();

    await brokerSyncController.addAlpacaApiKeyConnection(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(Account.create).not.toHaveBeenCalled();
  });

  test('rejects users without broker-sync access', async () => {
    TierService.canCreateBrokerConnection.mockResolvedValueOnce({
      allowed: false,
      message: 'Pro required',
      code: 'PRO_FEATURE_REQUIRED',
      tier: 'free'
    });

    const req = {
      user: { id: 'user-1' },
      headers: { host: 'tradetally.local' },
      body: { environment: 'paper', apiKeyId: 'PK-TEST', apiSecret: 'SECRET-TEST' }
    };
    const res = createRes();

    await brokerSyncController.addAlpacaApiKeyConnection(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(BrokerConnection.create).not.toHaveBeenCalled();
  });

  test('maps Alpaca auth failures to a 400 without storing credentials', async () => {
    alpacaService.getAccountWithApiKey.mockRejectedValueOnce({ response: { status: 401 } });

    const req = {
      user: { id: 'user-1' },
      headers: { host: 'tradetally.local' },
      body: { environment: 'paper', apiKeyId: 'PK-BAD', apiSecret: 'SECRET-BAD' }
    };
    const res = createRes();

    await brokerSyncController.addAlpacaApiKeyConnection(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ success: false, error: 'Invalid Alpaca API credentials' });
    expect(BrokerConnection.create).not.toHaveBeenCalled();
  });
});
