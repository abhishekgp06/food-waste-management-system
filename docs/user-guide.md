# End-User Guide & Role Workflows

## 1. Donor Workflow (Hostels, Restaurants, Caterers)

1. **Registration:**
   - Sign up with Organization/Individual name, email, password, contact number, and default location address.
   - Role automatically set to `DONOR` with instant active status.
2. **Publishing a Surplus Food Listing:**
   - Click "Post Surplus Food".
   - Specify: Food Title, Category (Cooked Meals, Bakery, Raw Groceries, Packaged), Quantity & Unit (e.g., 25 kg / 50 plates), Prepared Time, Expiry Time, Pickup Deadline, Pickup Address, and an optional photo.
   - Click "Publish". Listing transitions to `AVAILABLE`.
3. **Managing & Monitoring:**
   - Active listings appear on the Donor Dashboard.
   - When an NGO claims the food, status updates to `CLAIMED` in real time, revealing the claiming NGO's verified contact details.
   - When the volunteer arrives, the donor verifies the pickup and provides the secure handover confirmation.

---

## 2. Recipient Organization Workflow (NGOs & Charities)

1. **Registration & Verification:**
   - Sign up with Charity Name, Registration Number, Email, and City/GPS coordinates.
   - Account status defaults to `PENDING` until an Admin verifies credentials.
2. **Browsing & Discovering Food:**
   - Once approved, access the NGO Discovery Feed.
   - Use proximity sliders (e.g. 5 km, 10 km) and category filters to locate urgent listings before their pickup deadlines expire.
3. **Atomic Claiming:**
   - Click "Claim Donation".
   - The system executes a concurrency-safe reservation, guaranteeing no other NGO can claim the same listing.
4. **Logistics & Volunteer Assignment:**
   - Designate an internal or registered volunteer to complete collection before the deadline.

---

## 3. Volunteer Workflow (Collection & Delivery Personnel)

1. **Registration & Approval:**
   - Register account as `VOLUNTEER`. Status defaults to `PENDING` awaiting Admin authorization.
2. **Receiving Assignments:**
   - Log in to view assigned pickup tasks containing donor address, deadline, and NGO delivery destination.
3. **Fulfillment Cycle:**
   - **Arrive at Donor:** Enter handover code or confirm pickup; status transitions to `PICKED_UP` -> `IN_TRANSIT`.
   - **Arrive at NGO/Shelter:** Confirm handover; status transitions to `DELIVERED`.
   - **Handling Issues:** If food was spoiled or donor was unavailable, volunteer reports reason; status transitions to `FAILED_PICKUP` for admin review.

---

## 4. Administrator Workflow

1. **User Approvals:**
   - Review pending NGO and Volunteer accounts; verify legal NGO identity and click "Approve" or "Reject".
2. **Operational Oversight:**
   - Monitor real-time platform metrics: Active Listings, Successful Deliveries, Diverted Food Weight (kg), and Expired Waste.
3. **Audit Trail Inspection:**
   - Access the immutable `donation_events` table to resolve disputes, investigate delayed pickups, and audit lifecycle events.
