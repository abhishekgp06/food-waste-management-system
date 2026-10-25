import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { api, ApiError } from '../src/services/api.js';

describe('Centralized Frontend API Client (api.js)', () => {
  const originalFetch = global.fetch;

  after(() => {
    global.fetch = originalFetch;
  });

  it('ApiError should correctly expose status, code, details and requestId', () => {
    const err = new ApiError('Conflict occurred', 409, 'CONFLICT', [{ field: 'status', message: 'Already claimed' }], 'req-123');
    assert.strictEqual(err.message, 'Conflict occurred');
    assert.strictEqual(err.status, 409);
    assert.strictEqual(err.code, 'CONFLICT');
    assert.deepStrictEqual(err.details, [{ field: 'status', message: 'Already claimed' }]);
    assert.strictEqual(err.requestId, 'req-123');
  });

  it('auth.login should send POST to /api/v1/auth/login with credentials and parse response', async () => {
    let capturedUrl = null;
    let capturedOptions = null;

    global.fetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          message: 'Authentication successful',
          user: { id: 'u1', role: 'DONOR', status: 'ACTIVE' },
          token: 'jwt.token.here'
        })
      };
    };

    const res = await api.auth.login({ email: 'donor@example.com', password: 'Password@123' });
    assert.strictEqual(capturedUrl, '/api/v1/auth/login');
    assert.strictEqual(capturedOptions.method, 'POST');
    assert.strictEqual(capturedOptions.headers['Content-Type'], 'application/json');
    assert.strictEqual(res.token, 'jwt.token.here');
    assert.strictEqual(res.user.role, 'DONOR');
  });

  it('auth.getMe should inject Bearer token in Authorization header', async () => {
    let capturedHeaders = null;

    global.fetch = async (url, options) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ user: { id: 'u1', name: 'NGO Admin', role: 'NGO' } })
      };
    };

    const res = await api.auth.getMe('mock-jwt-token');
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer mock-jwt-token');
    assert.strictEqual(res.user.name, 'NGO Admin');
  });

  it('donations.getNearby should encode coordinates and radius query parameters', async () => {
    let capturedUrl = null;

    global.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ count: 1, donations: [{ id: 'd1', title: 'Food batch', distance_km: 2.4 }] })
      };
    };

    const res = await api.donations.getNearby({ lat: 12.305, lng: 76.655, radiusKm: 25 }, 'token-abc');
    assert.ok(capturedUrl.includes('/donations/nearby?'));
    assert.ok(capturedUrl.includes('lat=12.305'));
    assert.ok(capturedUrl.includes('lng=76.655'));
    assert.ok(capturedUrl.includes('radiusKm=25'));
    assert.strictEqual(res.donations[0].distance_km, 2.4);
  });

  it('donations.claim should send POST to /api/v1/donations/:id/claim with Authorization header', async () => {
    let capturedUrl = null;
    let capturedOptions = null;

    global.fetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          message: 'Donation claimed successfully',
          donation: { id: 'd-1', status: 'CLAIMED' },
          claim: { id: 'c-1', handover_code: '458921' }
        })
      };
    };

    const res = await api.donations.claim('d-1', 'ngo-token');
    assert.strictEqual(capturedUrl, '/api/v1/donations/d-1/claim');
    assert.strictEqual(capturedOptions.method, 'POST');
    assert.strictEqual(capturedOptions.headers['Authorization'], 'Bearer ngo-token');
    assert.strictEqual(res.claim.handover_code, '458921');
  });

  it('donations.claim should transform 409 Conflict response into ApiError with structured details', async () => {
    global.fetch = async () => {
      return {
        ok: false,
        status: 409,
        statusText: 'Conflict',
        headers: new Headers({
          'content-type': 'application/json',
          'x-request-id': 'req-conflict-999'
        }),
        json: async () => ({
          error: {
            code: 'CONFLICT',
            message: 'This donation is already claimed by another organization',
            details: [{ field: 'donation_id', message: 'An active claim already exists' }],
            requestId: 'req-conflict-999'
          }
        })
      };
    };

    await assert.rejects(
      async () => await api.donations.claim('d-competing', 'ngo-token'),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'CONFLICT');
        assert.strictEqual(err.message, 'This donation is already claimed by another organization');
        assert.strictEqual(err.requestId, 'req-conflict-999');
        assert.strictEqual(err.details[0].field, 'donation_id');
        return true;
      }
    );
  });

  it('donations.cancelClaim should send POST with reason payload', async () => {
    let capturedBody = null;

    global.fetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Claim cancelled successfully' })
      };
    };

    await api.donations.cancelClaim('d-1', 'Vehicle breakdown', 'ngo-token');
    assert.strictEqual(capturedBody.reason, 'Vehicle breakdown');
  });
});
