# Security & Privacy Guidelines

## 1. Threat Model & Mitigations

| Vulnerability / Threat | Risk in Food Systems | Implemented Mitigation |
| :--- | :--- | :--- |
| **Privilege Escalation** | Attacker assigns themselves `ADMIN` or `NGO` to access private details. | Strict RBAC middleware; public registration endpoint rejects `role='ADMIN'`; NGO/Volunteer defaults to `PENDING` approval. |
| **SQL Injection** | Attacker modifies SQL strings to dump user data or bypass authentication. | 100% parameterized queries via PostgreSQL client (`pg`); no string interpolation. |
| **Credential Compromise** | Committed AWS keys or plain text passwords leaked on GitHub. | Bcrypt hashing (salt rounds 10); strict `.gitignore`; `.env.example` placeholders only; EC2 IAM instance roles. |
| **XSS & Token Theft** | Malicious scripts in client steal JWT tokens. | Access tokens maintained in application memory (or secure HttpOnly cookies); sanitized inputs; Helmet security headers. |
| **Race Conditions (Double Claims)** | Concurrent requests claim the same meal simultaneously. | Transactional PostgreSQL row-locking (`SELECT FOR UPDATE`) and partial unique index on active claims. |
| **PII & Address Harvesting** | Competitors or malicious actors scrape donor contact numbers and locations. | Donor phone numbers and exact street addresses are masked until an authorized NGO successfully locks a claim. |
| **S3 Bucket Leakage** | Food donation photos or metadata made publicly browseable. | Private S3 bucket with Amazon S3 Block Public Access enabled; access granted exclusively via short-lived presigned URLs (15 min). |

---

## 2. Authentication & Authorization Policies

### A. Password Security
- Passwords must be a minimum of 8 characters containing upper, lower, numeric, and special characters.
- Passwords are hashed using `bcrypt` with salt rounds = 10 before storage.
- Plaintext passwords are never written to logs, console, or error responses.

### B. Role-Based Access Control (RBAC) Matrix
```text
Role       │ Public Endpoints │ Donor APIs │ NGO Claim APIs │ Volunteer Delivery │ Admin APIs
───────────┼──────────────────┼────────────┼────────────────┼────────────────────┼───────────
Anonymous  │ Yes (Login/Reg)  │ No         │ No             │ No                 │ No
Donor      │ Yes              │ Yes        │ No             │ No                 │ No
NGO        │ Yes              │ No         │ Yes (Approved) │ No                 │ No
Volunteer  │ Yes              │ No         │ No             │ Yes (Approved)     │ No
Admin      │ Yes              │ Yes (Audit)│ Yes (Audit)    │ Yes (Audit)        │ Yes (Full)
```

---

## 3. Food Safety & Legal Disclaimer

> [!WARNING]
> **Food Safety Verification Disclaimer**
> 
> The Cloud-Based Food Waste Management System provides an informational and logistical communication conduit between food donors and registered charitable organizations. 
> 
> 1. Donor-entered preparation and expiration times are self-reported. The platform programmatically prevents listing expired foods, but **software cannot physically inspect or certify biological food safety**.
> 2. Recipient organizations (NGOs) and volunteers must perform visual, olfactory, and temperature inspections upon collection in accordance with local health authorities (e.g., FSSAI guidelines).
> 3. The platform provides an immediate escalation reporting path for volunteers and NGOs to flag and cancel spoiled food listings.
