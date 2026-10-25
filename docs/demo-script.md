# Academic Project Demonstration Script

**Project Title:** Cloud-Based Food Waste Management System  
**Institution:** The National Institute of Engineering, Mysuru  
**Student:** Abhishek G P (4NI24IS096) | **Guide:** Ms. Prajakta M  
**Course Code:** BIS505 | **Academic Year:** 2026–2027

---

## 1. Demo Agenda (10–12 Minute Presentation)

| Sequence | Segment | Duration | Key Talking Points |
| :---: | :--- | :---: | :--- |
| **1** | Introduction & Problem Context | 2 mins | Campus & city-scale food waste, coordination failures, and project objectives. |
| **2** | Architecture & Tech Stack | 2 mins | Decoupled React/Vite SPA, Node/Express modular monolith, PostgreSQL ACID transactions, AWS EC2, S3, CloudWatch. |
| **3** | Core Differentiator: Concurrency Defense | 2 mins | Live demonstration of 20 concurrent claims against 1 donation proving **0% double claiming**. |
| **4** | End-to-End Role Lifecycle | 3 mins | Donor posts surplus food -> NGO claims -> Volunteer picks up & delivers -> Status transitions recorded. |
| **5** | Expiry Scheduler & Audit Trail | 2 mins | Schedulers auto-expiring stale meals; immutable audit history in `donation_events`. |
| **6** | Questions & Discussion | 2 mins | Address guide questions regarding cloud security, FSSAI guidelines, and cost guardrails. |

---

## 2. Step-by-Step Execution Plan

### Step 1: System Health & Architecture Tour
- Open browser at `https://<domain_or_ip>/health` or `http://localhost:5000/health`. Show JSON status:
  `{"status":"UP","database":"connected","timestamp":"..."}`.
- Explain Docker container setup running on AWS EC2.

### Step 2: Concurrency Proof (Live Benchmark)
- Open terminal and run the concurrency test script:
  ```bash
  npx autocannon -c 20 -a 20 -m POST -H "Authorization: Bearer <TOKEN>" http://localhost:5000/api/v1/donations/<DONATION_ID>/claim
  ```
- **Show results:** Exactly 1 success (HTTP 201) and 19 conflict rejections (HTTP 409).
- Explain PostgreSQL row locking mechanism (`SELECT FOR UPDATE`) and partial unique index on active claims.

### Step 3: Complete Workflow Demonstration
1. **Donor Portal:**
   - Log in as `hostel_donor@nie.ac.in`.
   - Post listing: "50 Meals - Cooked Rice & Sambar", set expiry window to 4 hours, and submit.
2. **NGO Portal:**
   - Log in as `mysuru_food_relief@ngo.org`.
   - Show distance filter using Haversine calculation showing listing is 2.3 km away.
   - Click "Claim Donation".
3. **Volunteer Portal:**
   - Log in as `volunteer1@nie.ac.in`.
   - Show assigned task. Confirm pickup with handover code -> State changes to `IN_TRANSIT` -> `DELIVERED`.
4. **Admin Dashboard:**
   - Review platform statistics.
   - Open `donation_events` table and show complete immutable history with timestamps and actor IDs.

---

## 3. Anticipated Guide Questions & Ready Responses

**Q1: Why did you choose Node.js/Express over Java Spring Boot?**  
*Response:* The approved college synopsis specifically specifies JavaScript/Node.js/Express.js. While Spring Boot has strong enterprise patterns, we adapted those exact layered architectural principles (Controllers, Services, Repositories, DTO validation) into Node.js to adhere strictly to our syllabus.

**Q2: How does the system prevent food poisoning or ensure food safety?**  
*Response:* Software cannot biologically verify food safety. Our system enforces strict operational hygiene by programmatically blocking listings past their pickup deadline, enforcing short shelf-life windows, providing clear safe-handling disclaimers, and logging volunteer physical verification upon collection.

**Q3: How do you prevent unexpected AWS cloud charges?**  
*Response:* We deployed a single EC2 instance running containerized Docker Compose, avoiding expensive managed queues, load balancers, or multi-AZ databases. We configured a hard AWS Billing Alarm at $5.00 with SNS email alerts and automated S3 lifecycle rules.
