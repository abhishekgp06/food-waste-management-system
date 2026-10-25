-- ==============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Initial schema for Cloud-Based Food Waste Management System
-- Database: PostgreSQL 14+
-- ==============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Users Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('DONOR', 'NGO', 'VOLUNTEER', 'ADMIN')),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED')),
    phone VARCHAR(20),
    location_lat DECIMAL(9, 6) CHECK (location_lat >= -90.0 AND location_lat <= 90.0),
    location_lng DECIMAL(9, 6) CHECK (location_lng >= -180.0 AND location_lng <= 180.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);

-- ------------------------------------------------------------------------------
-- 2. Donations Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(50) NOT NULL,
    prepared_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    pickup_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(9, 6) CHECK (latitude >= -90.0 AND latitude <= 90.0),
    longitude DECIMAL(9, 6) CHECK (longitude >= -180.0 AND longitude <= 180.0),
    image_s3_key VARCHAR(512),
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE' CHECK (
        status IN ('AVAILABLE', 'CLAIMED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'EXPIRED', 'CANCELLED', 'FAILED_PICKUP')
    ),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_expiry_after_prepared CHECK (prepared_at IS NULL OR expires_at > prepared_at),
    CONSTRAINT chk_deadline_before_expiry CHECK (pickup_deadline <= expires_at)
);

CREATE INDEX IF NOT EXISTS idx_donations_status_expires ON donations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_donations_donor_id ON donations(donor_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 3. Claims Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donation_id UUID NOT NULL REFERENCES donations(id) ON DELETE RESTRICT,
    ngo_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    volunteer_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'CLAIMED' CHECK (
        status IN ('CLAIMED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED')
    ),
    handover_code VARCHAR(10),
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP WITH TIME ZONE,
    picked_up_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claims_donation_id ON claims(donation_id);
CREATE INDEX IF NOT EXISTS idx_claims_ngo_id ON claims(ngo_id);
CREATE INDEX IF NOT EXISTS idx_claims_volunteer_id ON claims(volunteer_id);

-- Partial unique index ensuring only one active claim per donation
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_claim_per_donation
    ON claims(donation_id)
    WHERE status IN ('CLAIMED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT');

-- ------------------------------------------------------------------------------
-- 4. Donation Events (Audit Trail) Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donation_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donation_id UUID NOT NULL REFERENCES donations(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    reason TEXT,
    metadata_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_donation_events_donation ON donation_events(donation_id, created_at ASC);
