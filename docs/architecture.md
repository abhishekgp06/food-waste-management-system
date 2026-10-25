# Architecture & System Design

## 1. Architectural Style: Modular Monolith

To optimize developer velocity, enforce ACID transactional guarantees, and maintain lean hosting costs for an academic demonstration, the system utilizes a **decoupled Modular Monolith architecture**:

- **Frontend:** Single Page Application (SPA) built with React 18, Vite, and Tailwind CSS. Static assets are served efficiently via Nginx.
- **Backend:** Node.js (v20+ LTS) with Express.js, structured into distinct layers:
  - `routes/`: Express endpoint bindings.
  - `controllers/`: HTTP request handling, response shaping, status codes.
  - `services/`: Core business logic, transactional coordination.
  - `repositories/`: Data access layer and raw SQL queries via `pg`.
  - `validators/`: Strict request validation schemas.
  - `jobs/`: Scheduled workers (node-cron) for automated state transitions.
- **Database:** PostgreSQL 16 relational database with ACID compliance, row locking (`FOR UPDATE`), and partial unique indexes.
- **Cloud Infrastructure:** Single Amazon EC2 instance hosting Docker Compose (Nginx + API + DB or RDS), Amazon S3 for private media storage, and Amazon CloudWatch for centralized logging and health alarms.

---

## 2. High-Level System Architecture

```text
[ Donor / NGO / Volunteer / Admin ]
               │
               ▼ HTTPS (Port 443)
       ┌───────────────┐
       │     Nginx     │  (Reverse Proxy & Static Asset Server)
       └───────┬───────┘
               │ HTTP (Port 5000)
               ▼
       ┌────────────────────────┐
       │  Node.js + Express API │
       └───┬───────┬────────┬───┘
           │       │        │
           │       │        ▼
           │       │   ┌──────────────────────────┐
           │       │   │   Amazon CloudWatch      │
           │       │   │ (Structured JSON Logs)   │
           │       │   └──────────────────────────┘
           │       ▼
           │   ┌──────────────────────────┐
           │   │    Private Amazon S3     │
           │   │ (Presigned Upload/Read)  │
           │   └──────────────────────────┘
           ▼
   ┌───────────────────────────────────┐
   │ PostgreSQL Relational Database    │
   │ (ACID Transactions & Row Locking) │
   └───────────────────────────────────┘
```

---

## 3. Core Lifecycle Data Flows

### A. Atomic Claim Lifecycle
```text
NGO Client                  Express API                       PostgreSQL DB
    │                            │                                  │
    │ POST /donations/:id/claim  │                                  │
    ├───────────────────────────>│                                  │
    │                            │ BEGIN TRANSACTION                │
    │                            ├─────────────────────────────────>│
    │                            │ SELECT status FROM donations     │
    │                            │ WHERE id = :id FOR UPDATE        │
    │                            ├─────────────────────────────────>│
    │                            │ <── Returns Row (Locked)         │
    │                            │                                  │
    │                            │ IF status != 'AVAILABLE':        │
    │                            │   ROLLBACK & Return 409 Conflict │
    │                            │                                  │
    │                            │ UPDATE donations SET status=CLAIMED
    │                            │ INSERT INTO claims (...)         │
    │                            │ INSERT INTO donation_events (...)│
    │                            ├─────────────────────────────────>│
    │                            │ COMMIT                           │
    │                            ├─────────────────────────────────>│
    │ <── 201 Created (Claim Info)
```

### B. Secure Photo Upload via S3 Presigned URLs
```text
Donor Client                 Express API                       Amazon S3
    │                            │                                  │
    │ POST /donations/presign    │                                  │
    ├───────────────────────────>│                                  │
    │                            │ Validate MIME type & file size   │
    │                            │ Generate s3:PutObject URL (15m)  │
    │ <── Return presigned URL ──┤                                  │
    │                            │                                  │
    │ PUT [binary image] to Presigned URL                           │
    ├──────────────────────────────────────────────────────────────>│
    │ <── 200 OK ───────────────────────────────────────────────────┤
    │                            │                                  │
    │ POST /donations (with key) │                                  │
    ├───────────────────────────>│ Save record in DB                 │
```

---

## 4. AWS Cloud Topology & Security Configuration

- **Compute:** AWS EC2 `t3.micro` or `t3.medium` running Ubuntu 24.04 LTS.
- **Security Groups:**
  - Inbound: Port 80 (HTTP -> redirects to 443), Port 443 (HTTPS), Port 22 (SSH from restricted IP).
  - Outbound: All traffic allowed.
  - **Database Port 5432 is strictly private** and never accessible over the public internet.
- **IAM Instance Role:**
  - Policy: Scoped `s3:PutObject`, `s3:GetObject` on `arn:aws:s3:::nie-food-waste-photos/*`.
  - Policy: `logs:CreateLogStream`, `logs:PutLogEvents` on `/aws/food-waste-management-system/*`.
  - **No static AWS Access Keys stored on the server.**
- **Monitoring & Alarms:**
  - CloudWatch Alarm on CPU Utilization > 80% for 5 minutes.
  - CloudWatch Metric Filter on HTTP 5xx errors > 10 in 5 minutes.
  - AWS Billing Alarm configured at $5.00 limit.
