export const EARTH_RADIUS_KM = 6371.0;

/**
 * Calculates the great-circle distance between two geographic coordinates in kilometers
 * using the Haversine formula with numerical stability clamping to [0, 1].
 *
 * @param {number} lat1 - Origin latitude in degrees (-90 to 90)
 * @param {number} lng1 - Origin longitude in degrees (-180 to 180)
 * @param {number} lat2 - Target latitude in degrees (-90 to 90)
 * @param {number} lng2 - Target longitude in degrees (-180 to 180)
 * @returns {number} Distance in kilometers rounded to 2 decimal places
 */
export const calculateHaversineDistance = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180.0;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lng2 - lng1);

  const sinHalfDeltaPhi = Math.sin(deltaPhi / 2.0);
  const sinHalfDeltaLambda = Math.sin(deltaLambda / 2.0);

  const a =
    sinHalfDeltaPhi * sinHalfDeltaPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinHalfDeltaLambda * sinHalfDeltaLambda;

  // Clamping intermediate value to [0, 1] avoids floating-point errors causing NaN
  const clampedA = Math.max(0.0, Math.min(1.0, a));
  const c = 2.0 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1.0 - clampedA));

  const distance = EARTH_RADIUS_KM * c;
  return Math.round(distance * 100) / 100;
};

/**
 * Calculates a bounding box (minLat, maxLat, minLng, maxLng) around an origin point for a given radius in km.
 *
 * @param {number} lat - Latitude in degrees
 * @param {number} lng - Longitude in degrees
 * @param {number} radiusKm - Radius in kilometers
 * @returns {{ minLat: number, maxLat: number, minLng: number, maxLng: number }}
 */
export const calculateBoundingBox = (lat, lng, radiusKm) => {
  // 1 degree latitude is approximately 111.045 km
  const latDelta = radiusKm / 111.045;
  const minLat = Math.max(-90.0, lat - latDelta);
  const maxLat = Math.min(90.0, lat + latDelta);

  // Longitude delta depends on latitude
  const latRad = (lat * Math.PI) / 180.0;
  const cosLat = Math.cos(latRad);
  // Avoid division by zero near poles
  const lngDelta = cosLat > 0.0001 ? radiusKm / (111.045 * cosLat) : 180.0;
  const minLng = Math.max(-180.0, lng - lngDelta);
  const maxLng = Math.min(180.0, lng + lngDelta);

  return {
    minLat: Math.round(minLat * 1000000) / 1000000,
    maxLat: Math.round(maxLat * 1000000) / 1000000,
    minLng: Math.round(minLng * 1000000) / 1000000,
    maxLng: Math.round(maxLng * 1000000) / 1000000
  };
};

export default {
  EARTH_RADIUS_KM,
  calculateHaversineDistance,
  calculateBoundingBox
};
