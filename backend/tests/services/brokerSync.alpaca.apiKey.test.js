jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({
  create: jest.fn()
}));

jest.mock('../../src/models/BrokerConnection', () => ({
  updateOAuthTokens: jest.fn(),
  updateStatus: jest.fn(),
  updateSyncLog: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  invalidate: jest.fn()
}));

jest.mock('../../src/utils/cache', () => ({
  data: {},
  del: jest.fn()
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const axios = require('axios');
const alpacaService = require('../../src/services/brokerSync/alpacaService');

describe('AlpacaService API-key authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getAccountWithApiKey calls paper Alpaca with APCA API-key headers', async () => {
    axios.get.mockResolvedValueOnce({
      data: { id: 'acct-paper-1', account_number: 'PA1234', status: 'ACTIVE' }
    });

    const account = await alpacaService.getAccountWithApiKey('PK-TEST', 'SECRET-TEST', 'paper');

    expect(account).toEqual({ id: 'acct-paper-1', account_number: 'PA1234', status: 'ACTIVE' });
    expect(axios.get).toHaveBeenCalledWith(
      'https://paper-api.alpaca.markets/v2/account',
      {
        headers: {
          'APCA-API-KEY-ID': 'PK-TEST',
          'APCA-API-SECRET-KEY': 'SECRET-TEST'
        }
      }
    );
  });

  test('fetchExecutions uses API-key headers for API-key Alpaca connections', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });

    await alpacaService.fetchExecutions(null, {
      alpacaAuthType: 'api_key',
      alpacaApiKeyId: 'PK-TEST',
      alpacaApiSecret: 'SECRET-TEST',
      brokerEnvironment: 'paper'
    }, {
      startDate: '2026-01-01',
      endDate: '2026-01-31'
    });

    expect(axios.get).toHaveBeenCalledWith(
      'https://paper-api.alpaca.markets/v2/orders',
      expect.objectContaining({
        headers: {
          'APCA-API-KEY-ID': 'PK-TEST',
          'APCA-API-SECRET-KEY': 'SECRET-TEST'
        },
        params: expect.objectContaining({
          status: 'all',
          after: '2026-01-01',
          until: '2026-01-31'
        })
      })
    );
  });

  test('uses connection metadata account number as accountIdentifier when Alpaca order lacks account_id', async () => {
    axios.get.mockResolvedValueOnce({
      data: [
        {
          id: 'order-1',
          symbol: 'AAPL',
          side: 'buy',
          filled_qty: '3',
          filled_avg_price: '101.25',
          filled_at: '2026-06-18T14:30:00Z'
        }
      ]
    });

    const executions = await alpacaService.fetchExecutions(null, {
      alpacaAuthType: 'api_key',
      alpacaApiKeyId: 'PK-TEST',
      alpacaApiSecret: 'SECRET-TEST',
      brokerEnvironment: 'paper',
      brokerMetadata: { accountNumber: '****VIBF' }
    }, {});

    expect(executions).toHaveLength(1);
    const fill = alpacaService.mapExecutionToFill(executions[0]);
    expect(fill.accountIdentifier).toBe('****VIBF');
  });

  test('fetchExecutions preserves OAuth bearer headers for OAuth Alpaca connections', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });

    await alpacaService.fetchExecutions('oauth-token', {
      alpacaAuthType: 'oauth',
      brokerEnvironment: 'live'
    }, {});

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.alpaca.markets/v2/orders',
      expect.objectContaining({
        headers: { Authorization: 'Bearer oauth-token' }
      })
    );
  });

  test('ensureValidToken bypasses OAuth refresh for API-key connections', async () => {
    const result = await alpacaService.ensureValidToken({
      alpacaAuthType: 'api_key',
      alpacaApiKeyId: 'PK-TEST',
      alpacaApiSecret: 'SECRET-TEST'
    });

    expect(result).toEqual({ accessToken: null, needsReauth: false });
  });

  test('API-key connections fail fast when credentials are missing', () => {
    expect(() => alpacaService.getHeadersForConnection(null, {
      alpacaAuthType: 'api_key',
      alpacaApiKeyId: 'PK-TEST'
    })).toThrow('Missing Alpaca API key credentials');
  });
});
