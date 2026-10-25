# Database Design & Data Models

## 1. Relational Design Rationale

The system relies on PostgreSQL 16 to provide ACID transactional integrity. Food claim operations must be strictly atomic to prevent double-claiming under concurrent user access. PostgreSQL's row-level locking (`SELECT ... FOR UPDATE`) and partial unique indexing provide the necessary primitives without requiring complex distributed lock managers.

---

## 2. Entity-Relationship Overview

```text
  ┌───────────────────────┐
  │         USERS         │
  │───────────────────────│
  │ id (PK, UUID)         │
  │ name, email, role     │
  │ status, password_hash │
  │ location_lat, lng     │
  └───────────┬───────────┘
              │ 1
              │
              │ donor_id (1:N)
              ▼
  ┌───────────────────────┐         1:1 active         ┌───────────────────────┐
  │       DONATIONS       │ ────────────────────────── │        CLAIMS         │
  │───────────────────────│                            │───────────────────────│
  │ id (PK, UUID)         │                            │ id (PK, UUID)         │
  │ donor_id (FK)         │                            │ donation_id (FK)      │
  │ title, category       │                            │ ngo_id (FK)           │
  │ quantity, unit        │                            │ volunteer_id (FK)     │
  │ expires_at            │                            │ status, handover_code │
  │ pickup_deadline       │                            │ claimed_at, delivered │
  │ address, lat, lng     │                            └───────────────────────┘
  │ status                │                                        │
  └───────────┬───────────┘                                        │
              │ 1                                                  │
              │                                                    │
              │ donation_id (1:N)                                  │
              ▼                                                    ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                            DONATION_EVENTS                             │
  │────────────────────────────────────────────────────────────────────────│
  │ id (PK, UUID)                                                          │
  │ donation_id (FK)                                                       │
  │ actor_id (FK, nullable)                                                │
  │ from_status, to_status                                                 │
  │ reason, metadata_json, created_at                                      │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Schema Definitions

### A. `users` Table
Stores authentication credentials, roles, profile coordinates, and approval status.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique user identifier |
| `name` | VARCHAR(255) | NOT NULL | User or organization name |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | Login email (normalized lowercase) |
| `password_hash` | VARCHAR(255) | NOT NULL | Bcrypt hash (cost factor 10+) |
| `role` | VARCHAR(50) | NOT NULL, CHECK in ('DONOR','NGO','VOLUNTEER','ADMIN') | RBAC user role |
| `status` | VARCHAR(50) | NOT NULL, DEFAULT 'PENDING' | Status: `PENDING`, `ACTIVE`, `SUSPENDED` |
| `phone` | VARCHAR(20) | NULL | Contact phone number (masked in public API) |
| `location_lat` | DECIMAL(9,6)| CHECK between -90 and 90 | Geolocation latitude |
| `location_lng` | DECIMAL(9,6)| CHECK between -180 and 180 | Geolocation longitude |
| `created_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Registration timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Last updated timestamp |

### B. `donations` Table
Tracks surplus food listings from creation to final delivery or expiry.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique listing identifier |
| `donor_id` | UUID | NOT NULL, REFERENCES users(id) | Associated donor account |
| `title` | VARCHAR(255) | NOT NULL | Brief description of food items |
| `category` | VARCHAR(100) | NOT NULL | e.g. Cooked Meals, Bakery, Groceries |
| `description` | TEXT | NULL | Additional food handling details |
| `quantity` | NUMERIC(10,2)| NOT NULL, CHECK (quantity > 0) | Quantity available |
| `unit` | VARCHAR(50) | NOT NULL | e.g. kg, plates, packets |
| `prepared_at` | TIMESTAMPTZ | NULL | Time food was cooked/packaged |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Strict consumption expiry threshold |
| `pickup_deadline` | TIMESTAMPTZ | NOT NULL | Deadline for volunteer collection |
| `address` | TEXT | NOT NULL | Pickup physical address |
| `latitude` | DECIMAL(9,6)| CHECK between -90 and 90 | Pickup GPS latitude |
| `longitude` | DECIMAL(9,6)| CHECK between -180 and 180 | Pickup GPS longitude |
| `image_s3_key` | VARCHAR(512)| NULL | Private Amazon S3 object key |
| `status` | VARCHAR(50) | NOT NULL, DEFAULT 'AVAILABLE' | Lifecycle status |
| `created_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Record created timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Last updated timestamp |

### C. `claims` Table
Tracks recipient reservation and fulfillment details.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique claim identifier |
| `donation_id` | UUID | NOT NULL, REFERENCES donations(id) | Associated donation listing |
| `ngo_id` | UUID | NOT NULL, REFERENCES users(id) | Claiming NGO account |
| `volunteer_id` | UUID | NULL, REFERENCES users(id) | Assigned delivery volunteer |
| `status` | VARCHAR(50) | NOT NULL, DEFAULT 'CLAIMED' | Claim progress status |
| `handover_code` | VARCHAR(10) | NULL | 4-to-6 digit OTP for pickup verification |
| `claimed_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Timestamp when NGO locked claim |
| `assigned_at` | TIMESTAMPTZ | NULL | Timestamp volunteer was assigned |
| `picked_up_at` | TIMESTAMPTZ | NULL | Timestamp volunteer completed pickup |
| `delivered_at` | TIMESTAMPTZ | NULL | Timestamp delivered to NGO/shelter |
| `failure_reason`| TEXT | NULL | Reason logged if pickup fails |
| `created_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

### D. `donation_events` Table (Append-Only Audit Log)
Maintains an immutable audit log of every state transition.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Event identifier |
| `donation_id` | UUID | NOT NULL, REFERENCES donations(id) | Subject donation |
| `actor_id` | UUID | NULL, REFERENCES users(id) | User initiating action or NULL (system job) |
| `from_status` | VARCHAR(50) | NULL | Prior status |
| `to_status` | VARCHAR(50) | NOT NULL | New status |
| `reason` | TEXT | NULL | Human or system explanation |
| `metadata_json`| JSONB | NULL | Extra context (IP address, client user agent) |
| `created_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Immutable event timestamp |

---

## 4. Concurrency Guardrails & Partial Unique Index

To provide complete assurance that a donation cannot be simultaneously claimed by multiple recipients:

1. **Transaction Isolation & Row Lock:**
   ```sql
   BEGIN;
   SELECT id, status FROM donations WHERE id = $1 FOR UPDATE;
   -- Application checks that status === 'AVAILABLE'
   UPDATE donations SET status = 'CLAIMED', updated_at = NOW() WHERE id = $1;
   INSERT INTO claims (donation_id, ngo_id, status) VALUES ($1, $2, 'CLAIMED');
   INSERT INTO donation_events (donation_id, actor_id, from_status, to_status, reason)
   VALUES ($1, $2, 'AVAILABLE', 'CLAIMED', 'Claimed by NGO');
   COMMIT;
   ```
2. **Partial Unique Index Guard:**
   ```sql
   CREATE UNIQUE INDEX uq_active_claim_per_donation
       ON claims(donation_id)
       WHERE status IN ('CLAIMED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT');
   ```
   This ensures the database rejects any secondary insert attempting to create an active claim on an already claimed donation, even in the event of an application logic bug.
