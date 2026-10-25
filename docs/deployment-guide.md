# Deployment & Cloud Operations Guide

## 1. Local Containerized Deployment (Docker Compose)

### Prerequisites
- Docker Engine 24+ and Docker Compose v2+
- Git

### Quickstart
```bash
# 1. Clone repository and navigate to root
git clone <repository_url>
cd food-waste-management-system

# 2. Copy environment template
cp .env.example .env

# 3. Start services in background
docker compose up -d --build

# 4. Verify running containers
docker compose ps

# 5. Access services:
# - Frontend SPA: http://localhost:5173
# - Backend API:  http://localhost:5000
# - Healthcheck:  http://localhost:5000/health
```

---

## 2. AWS Production Deployment Architecture

```text
       Internet
          │
          ▼
   AWS EC2 Instance (Ubuntu 24.04 LTS, t3.medium)
   ┌───────────────────────────────────────────────────┐
   │  Nginx Reverse Proxy (SSL Termination / Certbot) │
   │  Port 80 (HTTP Redirect) -> Port 443 (HTTPS)      │
   └─────────────────────────┬─────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   Container: food_waste_client      Container: food_waste_server
   (React Static Build)              (Node.js Express API)
                                              │
                                              ▼
                                     Container: postgres
                                     (Persisted on AWS EBS Volume)
```

### Step 1: Provision EC2 & IAM Role
1. Launch an EC2 instance (`t3.medium`, Ubuntu 24.04 LTS) in `ap-south-1` (Mumbai).
2. Attach an IAM Instance Role with policies:
   - `AmazonS3FullAccess` (scoped to `arn:aws:s3:::nie-food-waste-photos/*`).
   - `CloudWatchAgentServerPolicy`.
3. Inbound Security Group rules:
   - Port 22 (SSH from admin IP only).
   - Port 80 (HTTP from 0.0.0.0/0).
   - Port 443 (HTTPS from 0.0.0.0/0).
   - **Port 5432: Strictly blocked from public internet.**

### Step 2: Configure Amazon S3 Bucket
1. Create bucket `nie-food-waste-photos-2026`.
2. Ensure **Block Public Access** is **ON** (all 4 settings checked).
3. Enable Default Encryption (SSE-S3).
4. Configure CORS rules allowing `PUT` from the frontend domain.

### Step 3: Configure CloudWatch Alarms & Budget Guardrail
1. Create a CloudWatch Alarm:
   - Metric: `CPUUtilization > 80%` for 5 minutes.
   - Action: Send notification to SNS topic (student/guide email).
2. Set AWS Billing Alarm at `$5.00` to prevent unexpected cloud charges.

---

## 3. Database Backup & Disaster Recovery

```bash
# Automated Daily Backup via pg_dump
docker exec -t food_waste_postgres pg_dump -U postgres -d food_waste_db | gzip > backup_$(date +%Y%m%d).sql.gz

# Disaster Recovery / Restore Verification Drill
gunzip < backup_20261025.sql.gz | docker exec -i food_waste_postgres psql -U postgres -d food_waste_db
```
