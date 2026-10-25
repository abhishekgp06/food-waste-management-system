# REST API Documentation

## 1. API Standards & Error Shape

All endpoints are versioned with prefix: `/api/v1`

### A. Authentication Header
Authenticated requests must supply a standard HTTP Bearer token:
```http
Authorization: Bearer <JWT_ACCESS_TOKEN>
```

### B. Standard Error Response Shape
All error responses consistently return a structured JSON body:
```json
{
  "error": {
    "code": "DONATION_ALREADY_CLAIMED",
    "message": "This donation is no longer available for claiming.",
    "requestId": "req_8f1a23e9b4c0",
    "details": []
  }
}
```

### C. Standard HTTP Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Validation failure or malformed payload.
- `401 Unauthorized`: Missing or invalid JWT token.
- `403 Forbidden`: Authenticated user lacks permission for this resource.
- `404 Not Found`: Resource does not exist or is inaccessible.
- `409 Conflict`: Concurrency conflict (e.g. race condition on claim).
- `500 Internal Server Error`: Unhandled server exception.

---

## 2. API Endpoints Catalog

### A. Authentication & User Profile
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Register donor, NGO, or volunteer. NGO/Volunteer starts in `PENDING` state. |
| `POST` | `/api/v1/auth/login` | Public | Authenticate with email/password; returns JWT access token. |
| `POST` | `/api/v1/auth/logout` | Authenticated | Invalidate client session state. |
| `GET` | `/api/v1/me` | Authenticated | Retrieve current user profile and verification status. |

### B. Food Donations
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/donations` | Authenticated | List donations with optional filters: `status`, `category`, `lat`, `lng`, `radiusKm`. |
| `POST` | `/api/v1/donations` | Donor | Create a new food listing. Validates numeric quantity and future expiry. |
| `GET` | `/api/v1/donations/:id` | Authenticated | Get detailed listing. Masks precise address until claimed by authorized NGO. |
| `PATCH` | `/api/v1/donations/:id` | Owning Donor | Update listing details while still in `AVAILABLE` state. |
| `DELETE`| `/api/v1/donations/:id` | Owning Donor / Admin | Cancel listing if unclaimed. |

### C. Claims & Logistics Management
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/donations/:id/claim` | Approved NGO | Atomically lock and claim an available donation. Returns 409 if already claimed. |
| `POST` | `/api/v1/claims/:id/assign-volunteer` | NGO / Admin | Assign an approved volunteer to fulfill the pickup. |
| `PATCH` | `/api/v1/claims/:id/status` | Volunteer / Admin | Update claim status (`PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `FAILED`). |
| `GET` | `/api/v1/me/donations` | Donor | View current user's posted donation history and fulfillment status. |
| `GET` | `/api/v1/me/claims` | NGO / Volunteer | View active claims and assigned delivery tasks. |

### D. System & Administration
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/dashboard` | Admin | Aggregated metrics: total donors, NGOs, claims, deliveries, expired counts. |
| `PATCH` | `/api/v1/admin/users/:id/approval` | Admin | Approve or suspend NGO and Volunteer registration accounts. |
| `GET` | `/health` | Public | Healthcheck probe for Docker container and CloudWatch monitoring. |
