import { randomUUID } from 'node:crypto';

// Regex allowing alphanumeric, hyphens, and underscores between 1 and 128 chars
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validates an incoming Request ID.
 * Returns true if the ID contains only safe alphanumeric/hyphen/underscore characters
 * and conforms to length constraints (1-128 characters).
 * @param {any} id
 * @returns {boolean}
 */
export const isValidRequestId = (id) => {
  if (typeof id !== 'string') {
    return false;
  }
  return VALID_REQUEST_ID_REGEX.test(id.trim());
};

/**
 * Express middleware that extracts or generates a unique correlation ID for every request.
 * Attaches the ID to req.id and sets the X-Request-Id response header.
 * Replaces invalid or unsafe incoming IDs with a newly generated UUID v4.
 */
export const requestId = (req, res, next) => {
  const incomingId = req.headers['x-request-id'];

  let correlationId;
  if (incomingId && isValidRequestId(incomingId)) {
    correlationId = incomingId.trim();
  } else {
    correlationId = randomUUID();
  }

  req.id = correlationId;
  res.setHeader('X-Request-Id', correlationId);

  next();
};

export default requestId;
