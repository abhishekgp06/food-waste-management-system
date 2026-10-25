import { ValidationError } from '../utils/errors.js';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ALLOWED_CATEGORIES = Object.freeze([
  'COOKED_MEALS',
  'RAW_FOOD',
  'PACKAGED_FOOD',
  'BAKERY',
  'DAIRY',
  'FRUITS_VEGETABLES',
  'BEVERAGES',
  'OTHER'
]);

export const ALLOWED_STATUSES = Object.freeze([
  'AVAILABLE',
  'CLAIMED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'EXPIRED',
  'CANCELLED',
  'FAILED_PICKUP'
]);

/**
 * Validates a UUID string.
 *
 * @param {string} id
 * @param {string} [fieldName='id']
 * @throws {ValidationError}
 * @returns {string} Trimmed UUID
 */
export const validateUuid = (id, fieldName = 'id') => {
  if (!id || typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
    throw new ValidationError(`Invalid ${fieldName} format: must be a valid UUID`, [
      { field: fieldName, message: `Must be a valid UUID` }
    ]);
  }
  return id.trim();
};

/**
 * Validates payload for creating a new food donation.
 *
 * @param {object} data
 * @throws {ValidationError}
 * @returns {object} Sanitized and normalized donation attributes
 */
export const validateCreateDonation = (data) => {
  const details = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ValidationError('Donation payload must be a JSON object', [
      { field: 'body', message: 'Request body must be a valid JSON object' }
    ]);
  }

  const {
    title,
    category,
    description,
    quantity,
    unit,
    prepared_at,
    expires_at,
    pickup_deadline,
    address,
    latitude,
    longitude,
    image_s3_key
  } = data;

  // 1. Title
  if (typeof title !== 'string' || title.trim().length === 0) {
    details.push({ field: 'title', message: 'Title is required' });
  } else if (title.trim().length < 3 || title.trim().length > 255) {
    details.push({ field: 'title', message: 'Title must be between 3 and 255 characters' });
  }

  // 2. Category
  if (typeof category !== 'string' || category.trim().length === 0) {
    details.push({ field: 'category', message: 'Category is required' });
  } else if (category.trim().length > 100) {
    details.push({ field: 'category', message: 'Category must not exceed 100 characters' });
  }

  // 3. Description (optional)
  if (description !== undefined && description !== null && typeof description !== 'string') {
    details.push({ field: 'description', message: 'Description must be a string' });
  }

  // 4. Quantity
  const numQuantity = Number(quantity);
  if (quantity === undefined || quantity === null || quantity === '' || Number.isNaN(numQuantity) || !Number.isFinite(numQuantity)) {
    details.push({ field: 'quantity', message: 'Quantity must be a valid numeric value' });
  } else if (numQuantity <= 0) {
    details.push({ field: 'quantity', message: 'Quantity must be greater than zero' });
  } else if (numQuantity > 99999999.99) {
    details.push({ field: 'quantity', message: 'Quantity exceeds maximum allowable limit' });
  }

  // 5. Unit
  if (typeof unit !== 'string' || unit.trim().length === 0) {
    details.push({ field: 'unit', message: 'Unit is required (e.g. kg, plates, servings, packets)' });
  } else if (unit.trim().length > 50) {
    details.push({ field: 'unit', message: 'Unit must not exceed 50 characters' });
  }

  // 6. Dates & Timeline validation
  const now = new Date();
  let parsedPreparedAt = null;
  let parsedExpiresAt = null;
  let parsedPickupDeadline = null;

  // Prepared At (optional)
  if (prepared_at !== undefined && prepared_at !== null && prepared_at !== '') {
    parsedPreparedAt = new Date(prepared_at);
    if (Number.isNaN(parsedPreparedAt.getTime())) {
      details.push({ field: 'prepared_at', message: 'Prepared date must be a valid ISO timestamp' });
    }
  }

  // Expires At (required, must be in future)
  if (!expires_at) {
    details.push({ field: 'expires_at', message: 'Expiration date (expires_at) is required' });
  } else {
    parsedExpiresAt = new Date(expires_at);
    if (Number.isNaN(parsedExpiresAt.getTime())) {
      details.push({ field: 'expires_at', message: 'Expiration date must be a valid ISO timestamp' });
    } else if (parsedExpiresAt.getTime() <= now.getTime()) {
      details.push({ field: 'expires_at', message: 'Expiration date must be in the future' });
    }
  }

  // Pickup Deadline (required, must be in future and <= expires_at)
  if (!pickup_deadline) {
    details.push({ field: 'pickup_deadline', message: 'Pickup deadline (pickup_deadline) is required' });
  } else {
    parsedPickupDeadline = new Date(pickup_deadline);
    if (Number.isNaN(parsedPickupDeadline.getTime())) {
      details.push({ field: 'pickup_deadline', message: 'Pickup deadline must be a valid ISO timestamp' });
    } else if (parsedPickupDeadline.getTime() <= now.getTime()) {
      details.push({ field: 'pickup_deadline', message: 'Pickup deadline must be in the future' });
    } else if (parsedExpiresAt && !Number.isNaN(parsedExpiresAt.getTime()) && parsedPickupDeadline.getTime() > parsedExpiresAt.getTime()) {
      details.push({ field: 'pickup_deadline', message: 'Pickup deadline must not be later than expiration date' });
    }
  }

  // If prepared_at is given, check that expires_at > prepared_at
  if (parsedPreparedAt && !Number.isNaN(parsedPreparedAt.getTime()) && parsedExpiresAt && !Number.isNaN(parsedExpiresAt.getTime())) {
    if (parsedPreparedAt.getTime() >= parsedExpiresAt.getTime()) {
      details.push({ field: 'prepared_at', message: 'Prepared date must be earlier than expiration date' });
    }
  }

  // 7. Address
  if (typeof address !== 'string' || address.trim().length === 0) {
    details.push({ field: 'address', message: 'Pickup address is required' });
  } else if (address.trim().length < 5 || address.trim().length > 1000) {
    details.push({ field: 'address', message: 'Address must be between 5 and 1000 characters' });
  }

  // 8. Coordinates
  let parsedLat = null;
  let parsedLng = null;

  if (latitude !== undefined && latitude !== null && latitude !== '') {
    parsedLat = Number(latitude);
    if (Number.isNaN(parsedLat) || !Number.isFinite(parsedLat) || parsedLat < -90.0 || parsedLat > 90.0) {
      details.push({ field: 'latitude', message: 'Latitude must be a valid number between -90.0 and 90.0' });
    }
  }

  if (longitude !== undefined && longitude !== null && longitude !== '') {
    parsedLng = Number(longitude);
    if (Number.isNaN(parsedLng) || !Number.isFinite(parsedLng) || parsedLng < -180.0 || parsedLng > 180.0) {
      details.push({ field: 'longitude', message: 'Longitude must be a valid number between -180.0 and 180.0' });
    }
  }

  // 9. Image key (optional)
  if (image_s3_key !== undefined && image_s3_key !== null && image_s3_key !== '') {
    if (typeof image_s3_key !== 'string' || image_s3_key.trim().length > 512) {
      details.push({ field: 'image_s3_key', message: 'Image S3 key must not exceed 512 characters' });
    }
  }

  if (details.length > 0) {
    throw new ValidationError('Donation validation failed', details);
  }

  return {
    title: title.trim(),
    category: category.trim().toUpperCase(),
    description: description ? description.trim() : null,
    quantity: Math.round(numQuantity * 100) / 100,
    unit: unit.trim().toLowerCase(),
    prepared_at: parsedPreparedAt ? parsedPreparedAt.toISOString() : null,
    expires_at: parsedExpiresAt.toISOString(),
    pickup_deadline: parsedPickupDeadline.toISOString(),
    address: address.trim(),
    latitude: parsedLat !== null ? Math.round(parsedLat * 1000000) / 1000000 : null,
    longitude: parsedLng !== null ? Math.round(parsedLng * 1000000) / 1000000 : null,
    image_s3_key: image_s3_key && typeof image_s3_key === 'string' && image_s3_key.trim() ? image_s3_key.trim() : null
  };
};

/**
 * Validates payload for updating an existing food donation.
 *
 * @param {object} data
 * @throws {ValidationError}
 * @returns {object} Sanitized updates
 */
export const validateUpdateDonation = (data) => {
  const details = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ValidationError('Update payload must be a JSON object', [
      { field: 'body', message: 'Request body must be a valid JSON object' }
    ]);
  }

  const {
    title,
    category,
    description,
    quantity,
    unit,
    prepared_at,
    expires_at,
    pickup_deadline,
    address,
    latitude,
    longitude,
    image_s3_key
  } = data;

  const updates = {};
  let fieldsCount = 0;

  // Title
  if (title !== undefined) {
    fieldsCount++;
    if (typeof title !== 'string' || title.trim().length === 0) {
      details.push({ field: 'title', message: 'Title cannot be empty' });
    } else if (title.trim().length < 3 || title.trim().length > 255) {
      details.push({ field: 'title', message: 'Title must be between 3 and 255 characters' });
    } else {
      updates.title = title.trim();
    }
  }

  // Category
  if (category !== undefined) {
    fieldsCount++;
    if (typeof category !== 'string' || category.trim().length === 0) {
      details.push({ field: 'category', message: 'Category cannot be empty' });
    } else if (category.trim().length > 100) {
      details.push({ field: 'category', message: 'Category must not exceed 100 characters' });
    } else {
      updates.category = category.trim().toUpperCase();
    }
  }

  // Description
  if (description !== undefined) {
    fieldsCount++;
    if (description !== null && typeof description !== 'string') {
      details.push({ field: 'description', message: 'Description must be a string' });
    } else {
      updates.description = description ? description.trim() : null;
    }
  }

  // Quantity
  if (quantity !== undefined) {
    fieldsCount++;
    const num = Number(quantity);
    if (Number.isNaN(num) || !Number.isFinite(num) || num <= 0) {
      details.push({ field: 'quantity', message: 'Quantity must be a positive number' });
    } else if (num > 99999999.99) {
      details.push({ field: 'quantity', message: 'Quantity exceeds maximum allowable limit' });
    } else {
      updates.quantity = Math.round(num * 100) / 100;
    }
  }

  // Unit
  if (unit !== undefined) {
    fieldsCount++;
    if (typeof unit !== 'string' || unit.trim().length === 0 || unit.trim().length > 50) {
      details.push({ field: 'unit', message: 'Unit must be between 1 and 50 characters' });
    } else {
      updates.unit = unit.trim().toLowerCase();
    }
  }

  // Dates
  if (prepared_at !== undefined) {
    fieldsCount++;
    if (prepared_at === null || prepared_at === '') {
      updates.prepared_at = null;
    } else {
      const p = new Date(prepared_at);
      if (Number.isNaN(p.getTime())) {
        details.push({ field: 'prepared_at', message: 'Prepared date must be a valid ISO timestamp' });
      } else {
        updates.prepared_at = p.toISOString();
      }
    }
  }

  if (expires_at !== undefined) {
    fieldsCount++;
    const e = new Date(expires_at);
    if (Number.isNaN(e.getTime())) {
      details.push({ field: 'expires_at', message: 'Expiration date must be a valid ISO timestamp' });
    } else if (e.getTime() <= Date.now()) {
      details.push({ field: 'expires_at', message: 'Expiration date must be in the future' });
    } else {
      updates.expires_at = e.toISOString();
    }
  }

  if (pickup_deadline !== undefined) {
    fieldsCount++;
    const p = new Date(pickup_deadline);
    if (Number.isNaN(p.getTime())) {
      details.push({ field: 'pickup_deadline', message: 'Pickup deadline must be a valid ISO timestamp' });
    } else if (p.getTime() <= Date.now()) {
      details.push({ field: 'pickup_deadline', message: 'Pickup deadline must be in the future' });
    } else {
      updates.pickup_deadline = p.toISOString();
    }
  }

  // If both pickup_deadline and expires_at are present in updates, verify ordering
  if (updates.pickup_deadline && updates.expires_at) {
    if (new Date(updates.pickup_deadline).getTime() > new Date(updates.expires_at).getTime()) {
      details.push({ field: 'pickup_deadline', message: 'Pickup deadline must not be later than expiration date' });
    }
  }

  // Address
  if (address !== undefined) {
    fieldsCount++;
    if (typeof address !== 'string' || address.trim().length < 5 || address.trim().length > 1000) {
      details.push({ field: 'address', message: 'Address must be between 5 and 1000 characters' });
    } else {
      updates.address = address.trim();
    }
  }

  // Coordinates
  if (latitude !== undefined) {
    fieldsCount++;
    if (latitude === null) {
      updates.latitude = null;
    } else {
      const lat = Number(latitude);
      if (Number.isNaN(lat) || !Number.isFinite(lat) || lat < -90.0 || lat > 90.0) {
        details.push({ field: 'latitude', message: 'Latitude must be between -90.0 and 90.0' });
      } else {
        updates.latitude = Math.round(lat * 1000000) / 1000000;
      }
    }
  }

  if (longitude !== undefined) {
    fieldsCount++;
    if (longitude === null) {
      updates.longitude = null;
    } else {
      const lng = Number(longitude);
      if (Number.isNaN(lng) || !Number.isFinite(lng) || lng < -180.0 || lng > 180.0) {
        details.push({ field: 'longitude', message: 'Longitude must be between -180.0 and 180.0' });
      } else {
        updates.longitude = Math.round(lng * 1000000) / 1000000;
      }
    }
  }

  if (image_s3_key !== undefined) {
    fieldsCount++;
    if (image_s3_key === null || image_s3_key === '') {
      updates.image_s3_key = null;
    } else if (typeof image_s3_key !== 'string' || image_s3_key.trim().length > 512) {
      details.push({ field: 'image_s3_key', message: 'Image S3 key must not exceed 512 characters' });
    } else {
      updates.image_s3_key = image_s3_key.trim();
    }
  }

  if (fieldsCount === 0) {
    throw new ValidationError('At least one updatable field must be provided', [
      { field: 'body', message: 'No updatable fields provided in request' }
    ]);
  }

  if (details.length > 0) {
    throw new ValidationError('Donation update validation failed', details);
  }

  return updates;
};

/**
 * Validates query parameters for listing donations.
 *
 * @param {object} query
 * @throws {ValidationError}
 * @returns {object} Validated query filters and pagination
 */
export const validateDonationFilters = (query = {}) => {
  const details = [];
  const filters = {};

  // Status
  if (query.status !== undefined && query.status !== '') {
    const s = String(query.status).trim().toUpperCase();
    if (!ALLOWED_STATUSES.includes(s)) {
      details.push({ field: 'status', message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
    } else {
      filters.status = s;
    }
  }

  // Category
  if (query.category !== undefined && query.category !== '') {
    filters.category = String(query.category).trim().toUpperCase();
  }

  // Donor ID
  if (query.donor_id !== undefined && query.donor_id !== '') {
    const dId = String(query.donor_id).trim();
    if (!UUID_REGEX.test(dId)) {
      details.push({ field: 'donor_id', message: 'donor_id must be a valid UUID' });
    } else {
      filters.donor_id = dId;
    }
  }

  // Pagination: page
  let page = 1;
  if (query.page !== undefined && query.page !== '') {
    const p = parseInt(query.page, 10);
    if (Number.isNaN(p) || p < 1) {
      details.push({ field: 'page', message: 'Page must be an integer greater than or equal to 1' });
    } else {
      page = p;
    }
  }
  filters.page = page;

  // Pagination: limit
  let limit = 10;
  if (query.limit !== undefined && query.limit !== '') {
    const l = parseInt(query.limit, 10);
    if (Number.isNaN(l) || l < 1 || l > 100) {
      details.push({ field: 'limit', message: 'Limit must be an integer between 1 and 100' });
    } else {
      limit = l;
    }
  }
  filters.limit = limit;

  if (details.length > 0) {
    throw new ValidationError('Invalid query parameters', details);
  }

  return filters;
};

/**
 * Validates query parameters for nearby proximity search.
 *
 * @param {object} query
 * @throws {ValidationError}
 * @returns {{ lat: number, lng: number, radiusKm: number, limit: number }}
 */
export const validateNearbySearch = (query = {}) => {
  const details = [];

  const { lat, lng, radiusKm, limit } = query;

  if (lat === undefined || lat === null || lat === '') {
    details.push({ field: 'lat', message: 'Latitude (lat) query parameter is required' });
  }
  const parsedLat = Number(lat);
  if (lat !== undefined && lat !== null && lat !== '' && (Number.isNaN(parsedLat) || !Number.isFinite(parsedLat) || parsedLat < -90.0 || parsedLat > 90.0)) {
    details.push({ field: 'lat', message: 'Latitude must be a valid number between -90.0 and 90.0' });
  }

  if (lng === undefined || lng === null || lng === '') {
    details.push({ field: 'lng', message: 'Longitude (lng) query parameter is required' });
  }
  const parsedLng = Number(lng);
  if (lng !== undefined && lng !== null && lng !== '' && (Number.isNaN(parsedLng) || !Number.isFinite(parsedLng) || parsedLng < -180.0 || parsedLng > 180.0)) {
    details.push({ field: 'lng', message: 'Longitude must be a valid number between -180.0 and 180.0' });
  }

  let parsedRadius = 10.0; // default 10 km
  if (radiusKm !== undefined && radiusKm !== null && radiusKm !== '') {
    const r = Number(radiusKm);
    if (Number.isNaN(r) || !Number.isFinite(r) || r <= 0) {
      details.push({ field: 'radiusKm', message: 'radiusKm must be a positive number greater than 0' });
    } else if (r > 500.0) {
      details.push({ field: 'radiusKm', message: 'radiusKm cannot exceed maximum limit of 500 km' });
    } else {
      parsedRadius = r;
    }
  }

  let parsedLimit = 20;
  if (limit !== undefined && limit !== null && limit !== '') {
    const l = parseInt(limit, 10);
    if (Number.isNaN(l) || l < 1 || l > 100) {
      details.push({ field: 'limit', message: 'limit must be an integer between 1 and 100' });
    } else {
      parsedLimit = l;
    }
  }

  if (details.length > 0) {
    throw new ValidationError('Invalid proximity search parameters', details);
  }

  return {
    lat: parsedLat,
    lng: parsedLng,
    radiusKm: parsedRadius,
    limit: parsedLimit
  };
};

export default {
  UUID_REGEX,
  ALLOWED_CATEGORIES,
  ALLOWED_STATUSES,
  validateUuid,
  validateCreateDonation,
  validateUpdateDonation,
  validateDonationFilters,
  validateNearbySearch
};
