# Project Overview: Cloud-Based Food Waste Management System

## Academic Metadata

- **Institution:** The National Institute of Engineering (NIE), Mysuru
- **Department:** Department of Information Science and Engineering
- **Course & Code:** BIS505
- **Academic Year:** 2026–2027
- **Student Name:** Abhishek G P
- **USN:** 4NI24IS096
- **Project Guide:** Ms. Prajakta M

---

## 1. Executive Summary

The **Cloud-Based Food Waste Management System** is an engineering solution designed to mitigate urban and institutional food waste by seamlessly connecting food donors (such as college hostels, restaurants, event organizers, and catering services) with verified recipient organizations (NGOs, charities, shelters) and delivery volunteers.

Surplus prepared meals frequently spoil due to lack of coordination, slow communication channels, and unverified collection windows. This platform replaces chaotic ad-hoc communication (e.g., messaging groups or phone calls) with a reliable, cloud-native web platform that enforces strict expiry tracking, atomic transactional food claims, proximity-based matching, and immutable audit logs.

---

## 2. Problem Statement

Commercial establishments, campus cafeterias, and banquet halls regularly produce large volumes of edible surplus food. Simultaneously, vulnerable populations served by NGOs face food insecurity. The critical operational barriers preventing effective donation include:
1. **Perishability & Expiry Constraints:** Prepared cooked food has a strict, short shelf-life (typically 2 to 6 hours). Without automated expiration enforcement, expired food risks distribution or claims get wasted.
2. **Race Conditions & Double Claiming:** Uncoordinated channels cause multiple charities to dispatch volunteers for the same listing, wasting volunteer time and fuel.
3. **Absence of Role Governance:** Unvetted accounts pose security and food safety risks.
4. **Lack of Auditability:** Donors and receiving organizations have no verifiable records or chain of custody of collected items.

---

## 3. Project Objectives

1. **Structured Listing & Expiry Management:** Enable donors to publish donations specifying food title, category, quantity, unit, preparation timestamp, collection deadline, address, and coordinates.
2. **Atomic Concurrency-Controlled Claims:** Ensure that once an NGO initiates a claim on a donation, database-level locking prevents duplicate claims.
3. **Proximity-Based Discovery:** Provide NGOs and volunteers with location-based proximity filtering using the Haversine formula to prioritize urgent, nearby pickups.
4. **Governed Role Lifecycle:** Implement strict Role-Based Access Control (RBAC) across four roles: `DONOR`, `NGO`, `VOLUNTEER`, and `ADMIN`. NGO and Volunteer accounts require explicit Admin verification before access.
5. **Chain of Custody & Audit Trail:** Maintain an immutable record in `donation_events` for every transition (`AVAILABLE` -> `CLAIMED` -> `PICKED_UP` -> `IN_TRANSIT` -> `DELIVERED`).
6. **Cost-Effective Cloud Architecture:** Deploy a containerized solution on AWS EC2, utilizing private Amazon S3 with presigned URLs, an IAM instance role, and Amazon CloudWatch monitoring.

---

## 4. Primary Stakeholders & Roles

| Role | Responsibility | Access Permissions |
| :--- | :--- | :--- |
| **Donor** | Hostels, restaurants, individuals | Register account; create, view, edit (while eligible), and cancel own donations; view donation history. |
| **NGO (Recipient)** | Registered charities, orphanages, food banks | Browse active available donations; filter by distance/category; claim available donations; coordinate pickup. Requires Admin approval. |
| **Volunteer** | Field delivery personnel | View assigned pickups; update delivery lifecycle (`PICKED_UP`, `IN_TRANSIT`, `DELIVERED`) using handover verification. Requires Admin approval. |
| **Admin** | System coordinator / platform manager | Approve/suspend NGO and volunteer accounts; oversee system health; resolve failed pickups; review immutable audit trail. |

---

## 5. Key Differentiators

Unlike generic CRUD projects, this system addresses specific engineering challenges identified during literature and repository evaluation:
- **Zero Double-Claims:** Handled via PostgreSQL row locking (`SELECT FOR UPDATE`) and partial unique indexes.
- **Automated Expiry Workers:** Background cron schedulers automatically mark unclaimed items past their pickup deadline as `EXPIRED`.
- **Private S3 Storage:** Strict Block Public Access; secure temporary access provided only through short-lived presigned URLs.
- **Auditable Accountability:** Every status change stores actor ID, timestamp, prior state, new state, and reason in an append-only log.
- **No Speculative Complexities:** Avoids expensive or inaccurate AI food safety classifications; focuses on robust, testable, and deterministic software engineering principles.
