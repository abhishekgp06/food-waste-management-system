# Cloud-Based Food Waste Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x%20LTS-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)
[![AWS](https://img.shields.io/badge/AWS-EC2%20%7C%20S3%20%7C%20CloudWatch-orange.svg)](https://aws.amazon.com/)

An engineering project submitted for the degree of Bachelor of Engineering in Information Science and Engineering at **The National Institute of Engineering (NIE), Mysuru** for the Academic Year **2026–2027**.

---

## 1. Project Overview & Academic Information

| Parameter | Details |
| :--- | :--- |
| **Project Title** | Cloud-Based Food Waste Management System |
| **Institution** | The National Institute of Engineering, Mysuru |
| **Department** | Department of Information Science and Engineering |
| **Course Code** | BIS505 |
| **Academic Year** | 2026–2027 |
| **Student Name** | Abhishek G P |
| **USN** | 4NI24IS004|
| **Project Guide** | Ms. Prajakta M |

The **Cloud-Based Food Waste Management System** is a cloud-native platform designed to bridge the logistical gap between food donors (such as college hostels, restaurants, cafeteria networks, and event halls) and recipient charitable organizations (NGOs, shelters, and food banks). By integrating strict expiration tracking, concurrency-safe atomic claims, proximity discovery, and immutable audit logs, the platform ensures that surplus food reaches those in need while strictly adhering to food safety timelines.

---

## 2. Problem Statement & Objectives

### Problem Statement
Urban centres and college campuses regularly generate significant volumes of wholesome cooked surplus food. Simultaneously, vulnerable populations supported by NGOs face severe food insecurity. Current food redistribution attempts rely on manual telephone communication or ad-hoc messaging groups, resulting in:
1. **Critical Expiry Losses:** Cooked food spoils within hours if not dispatched promptly.
2. **Race Conditions / Double-Claiming:** Multiple NGOs dispatch volunteer drivers for the same listing, leading to wasted transit costs and volunteer fatigue.
3. **Unverified Entities:** Absence of formal authentication and authorization poses food safety and accountability risks.
4. **Lack of Auditability:** Donors and regulators have no chain-of-custody tracking.

### Objectives
- **Automated Expiry Lifecycle:** Enforce strict listing deadlines and implement backend schedulers that automatically expire uncollected food before spoilage.
- **Atomic Concurrency-Controlled Claims:** Guarantee database-level row locking and partial unique indexes to completely eliminate double-claiming.
- **Proximity-Based Discovery:** Implement Haversine distance calculations so recipient NGOs can prioritize urgent, nearby food sources.
- **Role-Based Access Control (RBAC):** Provide separated, secure portals for `DONOR`, `NGO`, `VOLUNTEER`, and `ADMIN`, with mandatory administrative approval for NGOs and volunteers.
- **Immutable Audit Trail:** Log every state change into an append-only audit table (`donation_events`).
- **Cost-Optimized Cloud Deployment:** Deploy via Docker Compose on AWS EC2, utilizing private Amazon S3 with presigned URLs and Amazon CloudWatch monitoring.

---

## 3. Proposed Solution & Key Features

```text
  [ DONOR ]           [ NGO ]             [ VOLUNTEER ]          [ ADMIN ]
      │                  │                      │                    │
 Posts Surplus      Searches Nearby        Assigned Pickup      Verifies NGOs
 Food Listing        Claims Listing       & Confirms Handover   & Monitors Audit
```

- **Role-Specific Dashboards:** Custom user experiences tailored specifically to the operational requirements of Donors, NGOs, Delivery Volunteers, and Platform Administrators.
- **Atomic Food Claim Engine:** PostgreSQL `SELECT ... FOR UPDATE` row locks guarantee that two simultaneous claim clicks never result in duplicate reservations.
- **Automated Expiry Cron Workers:** Background workers continuously monitor and transition listings to `EXPIRED` once their collection window has lapsed.
- **Privacy-Preserving Contact Disclosure:** Exact donor street addresses and telephone numbers remain shielded from public view until an authorized claim is confirmed.
- **Secure Photo Uploads via S3 Presigned URLs:** Images upload directly from browser to private AWS S3 buckets without routing heavy binary streams through the API server.
- **Delivery Handover Verification:** One-time verification codes (handover tokens) guarantee physical chain-of-custody verification upon collection and drop-off.

---

## 4. Technology Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons
- **Backend:** Node.js (v20+ LTS), Express.js (Modular Monolith)
- **Database:** PostgreSQL 16 (ACID-compliant relational database)
- **Containerization:** Docker, Docker Compose
- **Cloud Infrastructure:** Amazon Web Services (AWS)
  - **Compute:** AWS EC2 (`t3.micro` / `t3.medium`)
  - **Storage:** Amazon Simple Storage Service (S3) (Private Bucket + Presigned URLs)
  - **Security & IAM:** AWS IAM Instance Roles (No static access keys on server)
  - **Reverse Proxy & SSL:** Nginx with Let's Encrypt TLS
  - **Monitoring:** Amazon CloudWatch (Structured JSON logs, CPU & 5xx error alarms)

---

## 5. Architecture Overview

The system employs a **Decoupled Modular Monolith** architecture:

```text
[ Browser Clients: Donor | NGO | Volunteer | Admin ]
                      │
                      ▼ HTTPS (443)
              ┌───────────────┐
              │     Nginx     │  (SSL Termination & Reverse Proxy)
              └───────┬───────┘
                      │ HTTP (5000)
                      ▼
              ┌────────────────────────┐
              │  Node.js + Express API │
              └───┬───────┬────────┬───┘
                  │       │        │
                  │       │        ▼
                  │       │   ┌──────────────────────────┐
                  │       │   │     Amazon CloudWatch    │
                  │       │   │  (Log Streams & Alarms)  │
                  │       │   └──────────────────────────┘
                  │       ▼
                  │   ┌──────────────────────────┐
                  │   │    Private Amazon S3     │
                  │   │ (Presigned Upload URLs)  │
                  │   └──────────────────────────┘
                  ▼
          ┌───────────────────────────────────┐
          │  PostgreSQL Relational Database   │
          │ (Row Locking & Audit Log Events)  │
          └───────────────────────────────────┘
```

For detailed architectural schematics, see [docs/architecture.md](docs/architecture.md).

---

## 6. Repository Structure

```text
food-waste-management-system/
├── client/                     # Frontend Application (React 18 + Vite + Tailwind)
│   ├── public/                 # Static assets, favicon, manifest
│   ├── src/
│   │   ├── assets/             # Images and design vectors
│   │   ├── components/         # Reusable UI components (buttons, modals, tables)
│   │   ├── layouts/            # Role-specific layouts (DonorLayout, NGOLayout, AdminLayout)
│   │   ├── pages/              # Route pages (Login, Register, Dashboard, Donations)
│   │   ├── services/           # Axios / Fetch API client services
│   │   ├── hooks/              # Custom React hooks (useAuth, useGeolocation)
│   │   ├── utils/              # Client formatting and date helper functions
│   │   ├── App.jsx             # Root React component and view shell
│   │   ├── index.css           # Tailwind directives and core styling
│   │   └── main.jsx            # Application mount entrypoint
│   ├── Dockerfile              # Multi-stage production container build
│   ├── package.json            # Client dependencies and build scripts
│   ├── tailwind.config.js      # Tailwind CSS configuration
│   └── vite.config.js          # Vite build and proxy settings
│
├── server/                     # Backend API (Node.js + Express.js Modular Monolith)
│   ├── src/
│   │   ├── config/             # Database connection pool and AWS SDK setup
│   │   ├── controllers/        # Request controllers (Auth, Donation, Claim, Admin)
│   │   ├── middleware/         # Auth verification, RBAC, error handlers, rate-limiting
│   │   ├── routes/             # Versioned Express routes (/api/v1/...)
│   │   ├── services/           # Business logic, atomic claim transaction engine
│   │   ├── repositories/       # Raw SQL queries and database access layer
│   │   ├── validators/         # Input validation schemas and boundary checks
│   │   ├── jobs/               # node-cron scheduled background workers for expiry
│   │   ├── utils/              # Haversine distance, token generation, loggers
│   │   ├── app.js              # Express application assembly and middleware
│   │   └── server.js           # Server entrypoint and graceful shutdown listeners
│   ├── Dockerfile              # Node.js LTS container build
│   └── package.json            # Server dependencies and lifecycle scripts
│
├── database/                   # Database Schemas & Migrations
│   └── migrations/             # Versioned SQL migration files
│       └── 001_initial_schema.sql  # Users, donations, claims, donation_events tables
│
├── docs/                       # Project Documentation & Academic Artifacts
│   ├── project-overview.md     # In-depth problem statement, scope, and objectives
│   ├── implementation-plan.md  # 12-week delivery roadmap and build milestones
│   ├── architecture.md         # System components, network topologies, and data flows
│   ├── database-design.md      # Relational schemas, ER diagram, and index strategies
│   ├── api-documentation.md    # REST API specification, headers, and status codes
│   ├── security.md             # RBAC matrix, token security, and food safety disclaimers
│   ├── testing.md              # Unit, negative authorization, and concurrency test suites
│   ├── deployment-guide.md     # Docker Compose and AWS EC2 deployment walkthrough
│   ├── user-guide.md           # Role-based instructions for Donors, NGOs, and Volunteers
│   ├── demo-script.md          # Step-by-step academic evaluation presentation script
│   ├── Final_Implementation_Plan_And_UI_Analysis.docx # Consolidated implementation plan
│   ├── screenshots/            # UI walkthrough screenshots (updated upon UI build)
│   └── reports/                # Project progress reports and evaluation submissions
│
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI workflow for validation and build
├── .gitignore                  # Excludes .env, node_modules, build outputs, and logs
├── .env.example                # Safe environment variable configuration template
├── docker-compose.yml          # Container configuration for Node, PostgreSQL, and Client
├── README.md                   # Comprehensive project documentation
└── LICENSE                     # MIT License
```

---

## 7. Installation & Local Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v20.x LTS or higher recommended)
- [npm](https://www.npmjs.com/) (v10.x or higher)
- [PostgreSQL](https://www.postgresql.org/) (v14 or higher) or [Docker Desktop](https://www.docker.com/)
- [Git](https://git-scm.com/)

### Clone the Repository
```bash
git clone https://github.com/<your-username>/food-waste-management-system.git
cd food-waste-management-system
```

---

## 8. Environment Variable Setup

Copy the `.env.example` template to `.env` in the repository root:

```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```

Review and adjust the configuration values in `.env` as required for your local machine:
- `PORT=5000`
- `DB_HOST=localhost`
- `DB_USER=postgres`
- `DB_PASSWORD=your_local_postgres_password`
- `DB_NAME=food_waste_db`
- `JWT_SECRET=your_secure_random_key`

> [!WARNING]
> Never commit your active `.env` file or sensitive secrets to version control. The `.gitignore` is pre-configured to exclude all `.env` variations.

---

## 9. Database Setup

### Option A: Local PostgreSQL Service
1. Create the database in PostgreSQL:
   ```sql
   CREATE DATABASE food_waste_db;
   ```
2. Execute the initial migration:
   ```bash
   # Using psql CLI
   psql -U postgres -d food_waste_db -f database/migrations/001_initial_schema.sql
   ```

### Option B: Containerized PostgreSQL via Docker
```bash
docker compose up -d postgres
```
The migration script located in `./database/migrations` will execute automatically on container initialization.

---

## 10. Commands to Run Frontend & Backend Locally

### Running the Backend API Server
```bash
cd server
npm install
npm run dev
```
The API server will boot on `http://localhost:5000`. Verify health status at `http://localhost:5000/health`.

### Running the Frontend Client
```bash
cd client
npm install
npm run dev
```
The Vite development server will launch on `http://localhost:5173`.

---

## 11. Testing Instructions

### Run Syntax and Lint Validation
```bash
# Server syntax check
cd server
node -c src/app.js src/server.js

# Client build validation
cd ../client
npm run build
```

### Concurrency Stress Testing (Proof of Zero Double-Claims)
Once the server is running with active mock data:
```bash
npx autocannon -c 20 -a 20 -m POST \
  -H "Authorization: Bearer <NGO_JWT_TOKEN>" \
  http://localhost:5000/api/v1/donations/<DONATION_ID>/claim
```
Expected output: Exactly 1 request succeeds (HTTP 201) and 19 requests return conflict (HTTP 409).

For full testing protocols, see [docs/testing.md](docs/testing.md).

---

## 12. Docker Instructions

To run the entire ecosystem (PostgreSQL, Express API, and React Client) in isolated containers:

```bash
# Build and start all services in detached mode
docker compose up -d --build

# View container logs
docker compose logs -f

# Check health of services
docker compose ps

# Tear down containers and preserve database volume
docker compose down
```

---

## 13. AWS Deployment Overview

The project is structured for cost-conscious, highly secure deployment on AWS:
1. **EC2 Compute Host:** Single `t3.micro` or `t3.medium` instance running Docker Compose behind an Nginx reverse proxy.
2. **Private Amazon S3 Storage:** Strict Block Public Access; images uploaded and retrieved exclusively using short-lived presigned URLs.
3. **IAM Instance Roles:** EC2 instance assumes a scoped IAM role for S3 and CloudWatch, eliminating static access keys from server files.
4. **Amazon CloudWatch:** Centralized structured logs and automatic alarms for high CPU and HTTP 5xx error spikes.
5. **Cost Guardrail:** AWS Billing Alarm configured at a hard `$5.00` limit to avoid unexpected charges.

Refer to [docs/deployment-guide.md](docs/deployment-guide.md) for step-by-step provisioning instructions.

---

## 14. Security Considerations

- **Strict RBAC:** Server-side authorization on every route; no client-side role trust; registration endpoints strictly forbid self-assigned `ADMIN` roles.
- **SQL Injection Prevention:** 100% parameterized SQL queries via `pg`.
- **Token Security:** Short-lived JWTs kept in memory or secure HttpOnly cookies; never in `localStorage`.
- **Private Data Protection:** Donor phone numbers and exact street addresses are masked until an authorized claim is finalized.
- **Audit Immutability:** Status changes trigger insert-only rows into `donation_events`; no deletion or mutation endpoints exist.

Refer to [docs/security.md](docs/security.md) for full security controls and the Food Safety Disclaimer.

---

## 15. Screenshots Section

*(This section will be updated with high-resolution UI captures as dashboard views are implemented in Phase 5 / Step 12).*

| Screen | Description | Status |
| :--- | :--- | :---: |
| **Donor Dashboard** | Food listing form, active status indicators, and claim history. | *Pending Step 12* |
| **NGO Discovery Feed** | Proximity search, expiry filters, and one-click claim modal. | *Pending Step 12* |
| **Volunteer Handover** | Collection route view, handover OTP prompt, and delivery confirmation. | *Pending Step 12* |
| **Admin Control Panel** | Account approval interface, platform analytics, and audit log viewer. | *Pending Step 12* |

---

## 16. Academic Demonstration Script

A structured 10–12 minute live presentation script is documented in [docs/demo-script.md](docs/demo-script.md). It outlines:
- System overview and real-world campus food waste context.
- Live demonstration of concurrency protection (Autocannon benchmark).
- End-to-end donor posting, NGO claim, and volunteer delivery walkthrough.
- Background automated expiration demonstration.
- Answers to common project evaluation questions.

---

## 17. Known Limitations & Future Enhancements

### Current Scope & Limitations
- **Single Claim per Donation:** Current MVP supports one recipient claiming the full quantity of a donation listing (partial quantity splitting is deferred).
- **Proximity Calculation:** Distance calculated via spherical Haversine formula rather than dynamic multi-stop road network routing.
- **Food Safety Responsibility:** Software enforces time boundaries but cannot biologically certify food safety.

### Future Roadmap
- Integration with OpenStreetMap / Google Maps Routing API for multi-stop volunteer dispatch.
- IoT integration with smart kitchen scales and cold-storage sensors.
- SMS / WhatsApp notification gateway using Amazon SNS or Twilio.
- Tax incentive and corporate social responsibility (CSR) certificate generation for commercial food donors.

---

## 18. Project Status

| Phase | Description | Status |
| :---: | :--- | :---: |
| **Phase 1 / Step 1** | Project Foundation, Repo Structure, Safe Env & Documentation | **Complete** |
| **Phase 2 / Step 2** | Database Connectivity & Migration Pipeline | *Awaiting Approval* |
| **Phase 2 / Step 3** | Express API Core, Centralized Error Handling & Health Probe | *Planned* |
| **Phase 2 / Step 4** | Authentication & Role-Based Access Control | *Planned* |
| **Phase 3 / Step 5** | Donation CRUD & Haversine Proximity Search | *Planned* |
| **Phase 4 / Step 6** | Atomic Concurrency Claim Engine & Audit Logger | *Planned* |
| **Phase 5 / Step 7** | React SPA Frontend Dashboards & API Integration | *Planned* |
| **Phase 6 / Step 8** | Background Expiry Workers & S3 Photo Uploads | *Planned* |
| **Phase 7 / Step 9** | Cloud Deployment, Containerization & Final Demo Validation | *Planned* |
