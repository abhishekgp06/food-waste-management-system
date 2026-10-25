import { query } from '../config/db.js';
import { calculateBoundingBox } from '../utils/geo.js';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Converts a raw database donation row into a clean, safe, API-facing object.
 *
 * @param {object} row - Database row
 * @returns {object|null} Safe donation object or null
 */
export const toSafeDonation = (row) => {
  if (!row || typeof row !== 'object') {
    return null;
  }

  return {
    id: row.id,
    donor_id: row.donor_id,
    donor_name: row.donor_name ?? undefined,
    donor_phone: row.donor_phone ?? undefined,
    title: row.title,
    category: row.category,
    description: row.description ?? null,
    quantity: Number(row.quantity),
    unit: row.unit,
    prepared_at: row.prepared_at ? new Date(row.prepared_at).toISOString() : null,
    expires_at: new Date(row.expires_at).toISOString(),
    pickup_deadline: new Date(row.pickup_deadline).toISOString(),
    address: row.address,
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
    image_s3_key: row.image_s3_key ?? null,
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    ...(row.distance_km !== undefined ? { distance_km: Math.round(Number(row.distance_km) * 100) / 100 } : {})
  };
};

/**
 * Inserts a new food donation record.
 *
 * @param {object} donationData
 * @param {Function} [queryFn=query]
 * @returns {Promise<object>} Safe donation object
 */
export const createDonation = async (donationData, queryFn = query) => {
  const {
    donor_id,
    title,
    category,
    description = null,
    quantity,
    unit,
    prepared_at = null,
    expires_at,
    pickup_deadline,
    address,
    latitude = null,
    longitude = null,
    image_s3_key = null
  } = donationData;

  const sql = `
    INSERT INTO donations (
      donor_id, title, category, description, quantity, unit,
      prepared_at, expires_at, pickup_deadline, address,
      latitude, longitude, image_s3_key, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'AVAILABLE')
    RETURNING id, donor_id, title, category, description, quantity, unit,
              prepared_at, expires_at, pickup_deadline, address,
              latitude, longitude, image_s3_key, status, created_at, updated_at;
  `;

  const params = [
    donor_id,
    title,
    category,
    description || null,
    Number(quantity),
    unit,
    prepared_at || null,
    expires_at,
    pickup_deadline,
    address,
    latitude !== null && latitude !== undefined ? Number(latitude) : null,
    longitude !== null && longitude !== undefined ? Number(longitude) : null,
    image_s3_key || null
  ];

  const result = await queryFn(sql, params);
  return toSafeDonation(result.rows[0]);
};

/**
 * Finds a single donation by UUID, joining basic donor details.
 *
 * @param {string} id - Donation UUID
 * @param {Function} [queryFn=query]
 * @returns {Promise<object|null>} Safe donation object or null
 */
export const findDonationById = async (id, queryFn = query) => {
  if (typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
    return null;
  }

  const sql = `
    SELECT d.*, u.name AS donor_name, u.phone AS donor_phone
    FROM donations d
    JOIN users u ON d.donor_id = u.id
    WHERE d.id = $1
    LIMIT 1;
  `;

  const result = await queryFn(sql, [id.trim()]);
  return toSafeDonation(result.rows[0]);
};

/**
 * Lists donations with optional filters and pagination.
 *
 * @param {object} options
 * @param {string} [options.status]
 * @param {string} [options.category]
 * @param {string} [options.donor_id]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {Function} [queryFn=query]
 * @returns {Promise<{ donations: object[], pagination: object }>}
 */
export const findDonations = async ({
  status,
  category,
  donor_id,
  page = 1,
  limit = 10
} = {}, queryFn = query) => {
  const whereClauses = [];
  const params = [];
  let paramIdx = 1;

  if (status) {
    whereClauses.push(`d.status = $${paramIdx++}`);
    params.push(status);
  }

  if (category) {
    whereClauses.push(`UPPER(d.category) = UPPER($${paramIdx++})`);
    params.push(category);
  }

  if (donor_id) {
    whereClauses.push(`d.donor_id = $${paramIdx++}`);
    params.push(donor_id);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const offset = (Math.max(1, page) - 1) * limit;

  params.push(limit);
  const limitIdx = paramIdx++;
  params.push(offset);
  const offsetIdx = paramIdx++;

  const sql = `
    SELECT d.*, u.name AS donor_name, u.phone AS donor_phone,
           COUNT(*) OVER() AS total_count
    FROM donations d
    JOIN users u ON d.donor_id = u.id
    ${whereSql}
    ORDER BY d.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx};
  `;

  const result = await queryFn(sql, params);
  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
  const donations = result.rows.map(toSafeDonation);

  return {
    donations,
    pagination: {
      total,
      page: Math.max(1, page),
      limit,
      totalPages: Math.ceil(total / limit) || 0
    }
  };
};

/**
 * Performs Haversine proximity search for available donations within a given radius.
 * Applies a bounding box prefilter in SQL followed by exact Haversine calculation
 * with intermediate value clamping to [0, 1] for numerical stability.
 *
 * @param {object} params
 * @param {number} params.lat - Latitude
 * @param {number} params.lng - Longitude
 * @param {number} params.radiusKm - Radius in km
 * @param {number} [params.limit=50] - Result limit
 * @param {Function} [queryFn=query]
 * @returns {Promise<object[]>} Nearby safe donation objects with distance_km, sorted nearest first
 */
export const findNearbyDonations = async ({
  lat,
  lng,
  radiusKm,
  limit = 50
}, queryFn = query) => {
  const box = calculateBoundingBox(lat, lng, radiusKm);

  const sql = `
    SELECT * FROM (
      SELECT d.*, u.name AS donor_name, u.phone AS donor_phone,
        (6371.0 * 2.0 * ASIN(
          SQRT(
            LEAST(1.0, GREATEST(0.0,
              SIN(RADIANS(d.latitude - $1) / 2.0) ^ 2 +
              COS(RADIANS($1)) * COS(RADIANS(d.latitude)) *
              SIN(RADIANS(d.longitude - $2) / 2.0) ^ 2
            ))
          )
        )) AS distance_km
      FROM donations d
      JOIN users u ON d.donor_id = u.id
      WHERE d.status = 'AVAILABLE'
        AND d.expires_at > NOW()
        AND d.pickup_deadline > NOW()
        AND d.latitude IS NOT NULL
        AND d.longitude IS NOT NULL
        AND d.latitude BETWEEN $4 AND $5
        AND d.longitude BETWEEN $6 AND $7
    ) nearby
    WHERE nearby.distance_km <= $3
    ORDER BY nearby.distance_km ASC
    LIMIT $8;
  `;

  const params = [
    lat,
    lng,
    radiusKm,
    box.minLat,
    box.maxLat,
    box.minLng,
    box.maxLng,
    limit
  ];

  const result = await queryFn(sql, params);
  return result.rows.map(toSafeDonation);
};

/**
 * Updates an existing donation record with whitelisted fields.
 *
 * @param {string} id - Donation UUID
 * @param {object} updates - Key-value updates
 * @param {Function} [queryFn=query]
 * @returns {Promise<object|null>} Safe donation object
 */
export const updateDonation = async (id, updates, queryFn = query) => {
  if (typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
    return null;
  }

  const setClauses = [];
  const params = [id.trim()];
  let paramIdx = 2;

  const allowedFields = [
    'title',
    'category',
    'description',
    'quantity',
    'unit',
    'prepared_at',
    'expires_at',
    'pickup_deadline',
    'address',
    'latitude',
    'longitude',
    'image_s3_key'
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = $${paramIdx++}`);
      params.push(updates[field]);
    }
  }

  if (setClauses.length === 0) {
    return null;
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

  const sql = `
    UPDATE donations
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING id, donor_id, title, category, description, quantity, unit,
              prepared_at, expires_at, pickup_deadline, address,
              latitude, longitude, image_s3_key, status, created_at, updated_at;
  `;

  const result = await queryFn(sql, params);
  return toSafeDonation(result.rows[0]);
};

/**
 * Deletes a donation record by UUID.
 *
 * @param {string} id - Donation UUID
 * @param {Function} [queryFn=query]
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
export const deleteDonation = async (id, queryFn = query) => {
  if (typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
    return false;
  }

  const sql = `
    DELETE FROM donations
    WHERE id = $1
    RETURNING id;
  `;

  const result = await queryFn(sql, [id.trim()]);
  return (result.rowCount ?? result.rows.length) > 0;
};

export default {
  toSafeDonation,
  createDonation,
  findDonationById,
  findDonations,
  findNearbyDonations,
  updateDonation,
  deleteDonation
};
