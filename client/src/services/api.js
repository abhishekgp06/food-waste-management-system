/**
 * Centralized API Client for Food Waste Management System
 * Wraps native fetch with automatic Bearer token injection,
 * centralized error normalization matching backend error contracts,
 * and parameterized query string generation.
 */

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api/v1';

class ApiError extends Error {
  constructor(message, status, code, details = [], requestId = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

/**
 * Executes an HTTP request with JSON parsing and standardized error handling.
 *
 * @param {string} endpoint - Relative path (e.g. '/auth/login' or '/donations')
 * @param {object} [options={}] - Fetch options
 * @param {string} [token=null] - Optional JWT Bearer token
 * @returns {Promise<any>} Parsed response data
 */
async function request(endpoint, options = {}, token = null) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Accept': 'application/json',
    ...options.headers,
  };

  // If body is present and not FormData, set Content-Type
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Inject Authorization header if token is provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Extract requestId header if returned by backend
    const requestId = response.headers.get('x-request-id');

    // Attempt to parse JSON response body
    let data = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    }

    if (!response.ok) {
      // Backend standardized error format: { error: { code, message, details, requestId } }
      const errPayload = data?.error || {};
      const errorMessage =
        errPayload.message ||
        data?.message ||
        `Request failed with HTTP ${response.status} (${response.statusText})`;
      const errorCode = errPayload.code || 'HTTP_ERROR';
      const errorDetails = errPayload.details || [];

      throw new ApiError(
        errorMessage,
        response.status,
        errorCode,
        errorDetails,
        requestId || errPayload.requestId
      );
    }

    return data;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network failures, CORS issues, or aborted requests
    throw new ApiError(
      err.message || 'Unable to connect to the server. Please check your internet connection.',
      0,
      'NETWORK_ERROR'
    );
  }
}

export const api = {
  // Authentication Endpoints
  auth: {
    login: (credentials) =>
      request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),

    register: (userData) =>
      request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      }),

    getMe: (token) =>
      request('/auth/me', {
        method: 'GET',
      }, token),
  },

  // Donation Endpoints
  donations: {
    list: (params = {}, token) => {
      const query = new URLSearchParams();
      if (params.status) query.append('status', params.status);
      if (params.category) query.append('category', params.category);
      if (params.donor_id) query.append('donor_id', params.donor_id);
      if (params.page) query.append('page', params.page);
      if (params.limit) query.append('limit', params.limit);

      const qs = query.toString();
      return request(`/donations${qs ? `?${qs}` : ''}`, { method: 'GET' }, token);
    },

    getNearby: (params = {}, token) => {
      const query = new URLSearchParams({
        lat: params.lat,
        lng: params.lng,
        radiusKm: params.radiusKm || 10,
        limit: params.limit || 20,
      });
      return request(`/donations/nearby?${query.toString()}`, { method: 'GET' }, token);
    },

    getById: (id, token) =>
      request(`/donations/${encodeURIComponent(id)}`, { method: 'GET' }, token),

    create: (data, token) =>
      request('/donations', {
        method: 'POST',
        body: JSON.stringify(data),
      }, token),

    update: (id, data, token) =>
      request(`/donations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }, token),

    delete: (id, token) =>
      request(`/donations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }, token),

    claim: (id, token) =>
      request(`/donations/${encodeURIComponent(id)}/claim`, {
        method: 'POST',
      }, token),

    cancelClaim: (id, reason, token) =>
      request(`/donations/${encodeURIComponent(id)}/cancel-claim`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Claim cancelled by user' }),
      }, token),
  },
};

export { ApiError };
export default api;
