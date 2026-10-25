# Implementation Plan & Delivery Roadmap

## Academic Project Details
- **Project:** Cloud-Based Food Waste Management System
- **Institution:** The National Institute of Engineering, Mysuru
- **Academic Year:** 2026–2027
- **Student:** Abhishek G P (USN: 4NI24IS096)
- **Guide:** Ms. Prajakta M

---

## 1. Twelve-Week Implementation Roadmap

| Week | Work Description | Deliverable / Quality Gate |
| :---: | :--- | :--- |
| **Weeks 1–2** | Finalize architecture, database schema, API contracts, RBAC model, and research questions. Review with guide. | Approved Phase 2 technical design document; baseline decisions accepted. |
| **Week 3** | Setup repository structure, Docker environment, PostgreSQL schema migrations, Express server shell, logging, and health endpoint. | Clean repository boots locally; migrations run successfully; secrets excluded from Git. |
| **Week 4** | Implement JWT authentication, bcrypt password hashing, RBAC middleware, admin account seeding, and NGO/Volunteer approval workflows. | Authentication and negative authorization tests passing (HTTP 401/403 enforced). |
| **Week 5** | Build Donation CRUD endpoints, input validation (numeric quantity, future expiry), geospatial distance filtering (Haversine), and private S3 presigned URL integration. | Donors can publish and manage listings; unauthorized mutations blocked. |
| **Week 6** | Build atomic claim transaction engine with PostgreSQL row-level locks; implement immutable event logging (`donation_events`). | Concurrency test with Autocannon confirms 0% duplicate claims under parallel requests. |
| **Week 7** | Implement volunteer assignment, status update state machine, handover verification code (OTP), and background cron jobs for automated expiry. | Schedulers auto-expire stale listings; state transitions strictly validated. |
| **Week 8** | Scaffold React SPA using Vite and Tailwind CSS. Implement role-specific UI layouts and dashboards (Donor, NGO, Volunteer, Admin). | End-to-end user workflows functional in responsive desktop/mobile views. |
| **Week 9** | Integrate frontend with backend REST API, token handling in memory, error banners, and loading states. | Full donation -> claim -> pickup -> delivery loop verified in browser. |
| **Week 10** | Docker Compose standardization, Nginx reverse proxy configuration, container health checks, and local environment parity. | Entire stack runs reproducibly with a single `docker compose up` command. |
| **Week 11** | AWS EC2 provisioning (t3.micro/t3.medium), IAM instance role setup, S3 bucket policy, CloudWatch structured logging, and budget alarms ($5.00 limit). | Live cloud deployment accessible over HTTPS with CloudWatch metrics active. |
| **Week 12** | Load testing, security regression, database backup/restore drills, final documentation, screenshots, and demo script preparation. | Academic submission package complete, verified, and presentation-ready. |

---

## 2. Step-by-Step Build Sequence for Pair Programming

Following the agreed Antigravity development workflow:

1. **Step 1 (Current Step):** Create repository foundation, documentation templates, directory skeleton, Docker configuration, and safe environment templates.
2. **Step 2:** Configure database migrations, connection pooling (`pg`), and verify clean schema creation.
3. **Step 3:** Build Express server core, centralized error handler, request logger (Winston), and `/health` probe.
4. **Step 4:** Implement authentication controllers (Register, Login, Me), bcrypt hashing, and JWT middleware.
5. **Step 5:** Implement Role-Based Access Control (RBAC) and admin verification middleware.
6. **Step 6:** Implement Donation listing, CRUD, and Haversine proximity search.
7. **Step 7:** Implement AWS S3 presigned URL generation for secure photo uploads.
8. **Step 8:** Implement atomic transactional claim engine with row-level locks and `donation_events` logging.
9. **Step 9:** Implement volunteer assignment, handover state machine, and OTP verification.
10. **Step 10:** Implement background expiry scheduler and missed-pickup monitor via `node-cron`.
11. **Step 11:** Implement Admin dashboard metrics and management endpoints.
12. **Step 12:** Build React + Vite + Tailwind CSS frontend interface with role-based routing.
13. **Step 13:** Connect React frontend to API and validate state management.
14. **Step 14:** Dockerize stack and configure Nginx reverse proxy.
15. **Step 15:** AWS Cloud deployment (EC2, S3, IAM, CloudWatch) and load testing verification.
