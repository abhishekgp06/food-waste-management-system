# Testing & Quality Assurance Plan

## 1. Testing Strategy Overview

The testing framework guarantees correctness across four critical quality vectors:
1. **Unit Tests:** Input validation, date math, Haversine geospatial distance calculation.
2. **Negative Authorization Tests:** Verifying that unauthorized roles are blocked from mutating protected resources (HTTP 401/403).
3. **Concurrency & Race Condition Tests:** Simulating parallel claim attempts on a single available donation to guarantee zero double claims.
4. **Lifecycle & Expiry Verification:** Verifying state machine transitions and scheduled automated expiration workers.

---

## 2. Test Plan Matrix

| Test Suite | Target Component | Scenario | Expected Behavior |
| :--- | :--- | :--- | :--- |
| **Auth 01** | `POST /auth/register` | Attempt to register with `role='ADMIN'`. | Server rejects or overrides role to standard `DONOR`/`PENDING`; no admin created. |
| **Auth 02** | `POST /auth/login` | Invalid password or non-existent email. | Generic 401 Unauthorized error without revealing email existence. |
| **Auth 03** | `GET /me` | Request without `Authorization` header. | Returns 401 Unauthorized. |
| **RBAC 01** | `POST /donations` | Authenticated NGO attempts to create food listing. | Returns 403 Forbidden (only DONOR allowed). |
| **RBAC 02** | `POST /donations/:id/claim` | Unapproved NGO (`status='PENDING'`) attempts claim. | Returns 403 Forbidden with approval pending message. |
| **RBAC 03** | `PATCH /donations/:id` | Donor attempts to edit another donor's listing. | Returns 403 Forbidden. |
| **Claim 01** | `POST /donations/:id/claim` | 20 concurrent requests issued to claim 1 donation. | Exactly **1 request receives 201 Created**; remaining 19 receive **409 Conflict**. |
| **Expiry 01** | Expiry Cron Job | Donation passes `pickup_deadline` without a claim. | Job marks status as `EXPIRED` and logs event in `donation_events`. |
| **Audit 01** | `donation_events` | User attempts to call `DELETE /donation_events/:id`. | 404 or 403; no endpoint exists to alter historical audit logs. |

---

## 3. Concurrency Test Execution Guide

Concurrency testing ensures the atomic claim engine functions under heavy load:

```bash
# Using Autocannon to issue 20 concurrent requests to a test donation
npx autocannon -c 20 -a 20 -m POST \
  -H "Authorization: Bearer <NGO_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  http://localhost:5000/api/v1/donations/d1b2c3d4-0000-0000-0000-000000000001/claim
```

**Acceptance Criteria:**
- Total 201 responses: Exactly 1.
- Total 409 responses: Exactly 19.
- Database records in `claims`: Exactly 1 active claim.
