-- Add performance indexes for booking table
-- These accelerate the most frequent query patterns identified in the performance audit.

-- Index on date: accelerates dashboard date-range queries (today count, month count)
-- and calendar date-range filtering. Without this index, every date-based query
-- performs a sequential scan of the entire booking table.
CREATE INDEX IF NOT EXISTS "bookings_date_idx" ON "bookings"("date");

-- Index on source: accelerates dashboard WhatsApp/Instagram booking count queries
-- which previously scanned the full table without any source index.
CREATE INDEX IF NOT EXISTS "bookings_source_idx" ON "bookings"("source");

-- Index on service: accelerates analytics queries that group bookings by service
-- (Most Booked Services chart). Without this, every service aggregation scans all rows.
CREATE INDEX IF NOT EXISTS "bookings_service_idx" ON "bookings"("service");

-- Composite index on doctorId, date, status: accelerates availability slot calculation
-- which queries bookings WHERE doctorId = ? AND date = ? AND status NOT IN ('cancelled').
-- The existing (doctorId, date) index helps but filtering by status still requires
-- a scan of matching rows. This composite index covers the entire WHERE clause.
CREATE INDEX IF NOT EXISTS "bookings_doctor_id_date_status_idx" ON "bookings"("doctorId", "date", "status");
