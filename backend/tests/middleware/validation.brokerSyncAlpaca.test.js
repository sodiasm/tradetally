const { schemas } = require('../../src/middleware/validation');

describe('brokerSyncAlpacaApiKeyConnection validation', () => {
  test('accepts valid Alpaca API-key connection payload', () => {
    const { error, value } = schemas.brokerSyncAlpacaApiKeyConnection.validate({
      apiKeyId: 'PK-TEST',
      apiSecret: 'SECRET-TEST',
      environment: 'paper',
      accountLabel: 'Strategy A Paper',
      autoSyncEnabled: true,
      syncFrequency: 'daily',
      syncTime: '06:00:00',
      syncStartDate: '2026-01-01'
    });

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      apiKeyId: 'PK-TEST',
      apiSecret: 'SECRET-TEST',
      environment: 'paper',
      accountLabel: 'Strategy A Paper',
      autoSyncEnabled: true,
      syncFrequency: 'daily',
      syncTime: '06:00:00',
      syncStartDate: '2026-01-01'
    });
  });

  test('defaults environment to live and auto sync to false', () => {
    const { error, value } = schemas.brokerSyncAlpacaApiKeyConnection.validate({
      apiKeyId: 'PK-TEST',
      apiSecret: 'SECRET-TEST'
    });

    expect(error).toBeUndefined();
    expect(value.environment).toBe('live');
    expect(value.autoSyncEnabled).toBe(false);
  });

  test('rejects missing credentials and invalid environment', () => {
    expect(schemas.brokerSyncAlpacaApiKeyConnection.validate({ apiSecret: 'SECRET' }).error).toBeDefined();
    expect(schemas.brokerSyncAlpacaApiKeyConnection.validate({ apiKeyId: 'PK' }).error).toBeDefined();
    expect(schemas.brokerSyncAlpacaApiKeyConnection.validate({
      apiKeyId: 'PK',
      apiSecret: 'SECRET',
      environment: 'sandbox'
    }).error).toBeDefined();
  });
});
