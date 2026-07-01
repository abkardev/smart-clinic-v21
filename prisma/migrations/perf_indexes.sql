-- SmartClinic: Additional performance indexes
-- Run: npx prisma migrate dev --name perf_indexes

-- Bookings: fast lookup by phone (patient lookup, WhatsApp)
CREATE INDEX IF NOT EXISTS "bookings_phone_idx"
  ON "bookings" ("phone");

-- Bookings: fast lookup by date range across all doctors (dashboard stats)
CREATE INDEX IF NOT EXISTS "bookings_date_status_idx"
  ON "bookings" ("date", "status");

-- Bookings: fast lookup by source (analytics)
CREATE INDEX IF NOT EXISTS "bookings_source_idx"
  ON "bookings" ("source");

-- Bookings: fast "most recent N bookings" lookup (dashboard recent activity widget)
CREATE INDEX IF NOT EXISTS "bookings_created_at_idx"
  ON "bookings" ("created_at" DESC);

-- Users: fast lookup by status (user management)
CREATE INDEX IF NOT EXISTS "users_status_idx"
  ON "users" ("status");

-- Users: fast lookup by role
CREATE INDEX IF NOT EXISTS "users_role_idx"
  ON "users" ("role");

-- AuditLogs: fast lookup by entity + action (filtering)
CREATE INDEX IF NOT EXISTS "audit_logs_entity_action_idx"
  ON "audit_logs" ("entity", "action");

-- Holidays: fast lookup by type + dayOfWeek (availability check)
CREATE INDEX IF NOT EXISTS "holidays_type_dow_idx"
  ON "holidays" ("type", "day_of_week");

-- Holidays: fast lookup by specific date
CREATE INDEX IF NOT EXISTS "holidays_type_date_idx"
  ON "holidays" ("type", "date");

-- BlockedSlots: fast lookup by doctorId + isWholeDay
CREATE INDEX IF NOT EXISTS "blocked_slots_doctor_wholeday_idx"
  ON "blocked_slots" ("doctor_id", "is_whole_day");

-- WhatsAppSessions: cleanup old sessions efficiently
CREATE INDEX IF NOT EXISTS "whatsapp_sessions_expires_idx"
  ON "whatsapp_sessions" ("expires_at");
