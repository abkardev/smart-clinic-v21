# SmartClinic — Feature Documentation

> **Intelligent Clinic Management System**  
> Stack: Next.js 14 · React 18 · TypeScript · PostgreSQL · Prisma ORM · Vercel

---

## Table of Contents

1. [Overview](#overview)
2. [User Roles & Access Control](#user-roles--access-control)
3. [Authentication](#authentication)
4. [Dashboard](#dashboard)
5. [Booking Management](#booking-management)
6. [Doctor Management](#doctor-management)
7. [Calendar View](#calendar-view)
8. [Slot Manager](#slot-manager)
9. [Analytics](#analytics)
10. [Holidays Management](#holidays-management)
11. [Offers & Promotions](#offers--promotions)
12. [WhatsApp Bot](#whatsapp-bot)
13. [Instagram Bot](#instagram-bot)
14. [User Management](#user-management)
15. [Audit Logs](#audit-logs)
16. [Internationalization (AR/EN)](#internationalization-aren)
17. [Google Calendar Integration](#google-calendar-integration)
18. [API Reference](#api-reference)
19. [Data Models](#data-models)
20. [What This Project Does NOT Have](#what-this-project-does-not-have)

---

## Overview

SmartClinic is a full-stack clinic management portal that allows medical clinics to manage appointments, doctors, availability, and patient communications through WhatsApp and Instagram — all from a single bilingual (Arabic/English) dashboard.

It is **not** a patient-facing booking website. It is an internal operations tool for clinic administrators and doctors, with automated patient-facing bots running on WhatsApp and Instagram.

---

## User Roles & Access Control

Three roles with different permission levels:

| Role | Permissions |
|---|---|
| **Superadmin** | Full access to everything including user management, role changes, and system settings |
| **Admin** | Manage bookings, doctors, offers, holidays, blocked slots, and view audit logs |
| **Doctor** | View own schedule, block own slots, view own bookings |

**Account lifecycle:** New registrations are `pending` by default and require admin approval before login is permitted.

| Status | Meaning |
|---|---|
| `pending` | Registered, awaiting approval |
| `approved` | Active, can log in |
| `rejected` | Registration denied |
| `suspended` | Temporarily disabled |

---

## Authentication

- **Registration** — Self-registration with email/password. First registered user is automatically promoted to `superadmin`. All subsequent users start as `pending` until approved.
- **Login** — Email + password with JWT token (7-day expiry). Last login timestamp is recorded.
- **Password reset** — Forgot password flow generates a secure SHA-256 hashed token valid for 1 hour and logs the reset URL (email service is pluggable).
- **JWT-protected API** — All protected API routes validate the `Authorization: Bearer <token>` header. Invalid or missing tokens return `401`.
- **Edge middleware** — Unauthenticated requests to protected routes are rejected at the Next.js edge layer before any database query runs.

---

## Dashboard

The landing page after login. Gives a real-time snapshot of clinic activity.

**Stats cards:**
- Total bookings (all time)
- Today's bookings
- This month's bookings
- Active doctors count
- WhatsApp bookings count
- Booking status breakdown: pending / confirmed / completed / cancelled / no-show

**Charts:**
- Bookings by doctor (bar chart)

**Recent bookings table:**
- Last 5 bookings with patient name, doctor, service, date, time, and status

All stats are fetched live from the database on each page load.

---

## Booking Management

Full CRUD interface for appointments.

**Booking fields:**
- Patient name
- Patient phone number
- Doctor (linked)
- Service type (General Consultation, Follow-up, Specialist Visit, Lab Results Review, Prescription Renewal)
- Date (YYYY-MM-DD)
- Time slot (HH:MM)
- Status
- Notes
- Source (dashboard / whatsapp / instagram / api)
- Google Calendar event link (if synced)
- Reminder sent flag + timestamp

**Booking statuses:**
- `pending` — Default for dashboard-created bookings
- `confirmed` — Confirmed by staff or auto-confirmed via bot
- `completed` — Appointment done
- `cancelled` — Cancelled by staff
- `no-show` — Patient did not arrive

**Features:**
- Filter by doctor, status, date range, and service
- Search / sort via MUI DataGrid
- Drag-and-drop rescheduling (moves booking to new date/time with availability check)
- Double-booking prevention (database-level unique constraint on `[doctorId, date, time]`)
- Availability validation before saving — rejects slots that are booked, blocked, or in a break period
- WhatsApp reminder button — sends reminder message directly to patient's WhatsApp
- Google Calendar auto-sync on create and update (non-fatal if Calendar is not configured)

---

## Doctor Management

Manage all clinic doctors and their working schedules.

**Doctor profile fields:**
- Name (English + Arabic)
- Specialty (English + Arabic)
- Phone number
- Email
- Google Calendar ID (for calendar sync)

**Schedule configuration per doctor:**
- Working hours (start time → end time)
- Working days (any combination of Sunday–Saturday)
- Slot duration (minutes per appointment, e.g. 20, 30, 45, 60)
- Break time (enable/disable, start time, end time)

**Operations:**
- Create doctor
- Edit doctor profile and schedule
- Soft-delete (deactivate) — doctor is hidden but historical bookings are preserved
- Google Calendar sync button — pulls existing events from doctor's calendar

All doctor create/update/deactivate actions are recorded in the audit log with a before/after field diff.

---

## Calendar View

Visual calendar showing all bookings across all doctors (or filtered by a single doctor).

- **Views:** Month, Week, Day
- **Color coding by status:** pending (yellow), confirmed (blue), completed (green), cancelled (red), no-show (purple)
- **Blocked slots** shown in grey with reason
- **Click event** opens booking detail panel
- **Drag-and-drop** to reschedule (validates availability before saving)
- **Doctor filter** dropdown — view one doctor's calendar at a time
- **RTL support** — calendar toolbar and dates flip for Arabic mode
- Built with **FullCalendar v6**

---

## Slot Manager

A dedicated tool for blocking individual time slots or entire days.

**Block options:**
- Block a specific time slot (e.g. 10:00 on a specific date)
- Block an entire day for a doctor

**Per blocked slot:**
- Doctor selection
- Date picker
- Time picker (or whole-day toggle)
- Reason text

**Google Calendar sync:**
- Blocked slots are optionally synced to the doctor's Google Calendar as "Unavailable" events
- Unblocking a slot deletes the corresponding Calendar event

**Access control:**
- Doctors can only block/unblock their own slots
- Admins and superadmins can block any doctor's slots

---

## Analytics

Data visualization page with booking trend analysis.

**Metrics available:**
- Total bookings in selected period
- Bookings by status (breakdown chart)
- Bookings by doctor (comparison chart)
- Bookings by source (WhatsApp vs dashboard vs Instagram)
- No-show rate
- Service popularity breakdown

**Filters:**
- Date range (start date / end date)
- Doctor filter
- Charts built with **Recharts**

---

## Holidays Management

Define clinic holidays that automatically block all bookings on those days.

**Two holiday types:**

| Type | Description |
|---|---|
| **Weekly** | Recurring — blocks the same day every week (e.g. every Friday) |
| **Specific date** | One-time holiday on a particular calendar date |

**Scope options:**
- Apply to all doctors
- Apply to specific doctors only (many-to-many relationship)

**Effect:** When a patient or admin tries to book on a holiday date, the system rejects the slot with a "holiday" reason and (for bots) suggests the nearest available alternative dates.

Holiday names stored in both English and Arabic.

---

## Offers & Promotions

Create and manage promotional offers displayed to patients via the WhatsApp and Instagram bots.

**Offer fields:**
- Title (English + Arabic)
- Description (English + Arabic)
- Discount code (optional)
- Expiry date (optional)
- Image (uploaded as base64, stored with URL)
- Active / inactive toggle

**Bot integration:**
- Active offers are displayed when a patient selects "Offers" from the bot menu
- Expired offers (past `expiresAt`) are automatically hidden
- After viewing offers, the bot guides the patient to book an appointment

---

## WhatsApp Bot

Automated Arabic-language booking assistant integrated with the **Meta WhatsApp Cloud API**.

**Webhook endpoints:**
- `GET /api/whatsapp/webhook` — Meta webhook verification
- `POST /api/whatsapp/webhook` — Incoming message handler
- `POST /api/whatsapp/reminder/[id]` — Send reminder from dashboard

**Conversation flow:**

```
Patient sends "مرحبا" (or any greeting trigger)
    ↓
Main Menu (interactive list)
    ├── 📅 Book Appointment
    │       ↓
    │   Select Doctor (interactive list)
    │       ↓
    │   Select Service (interactive list)
    │       ↓
    │   Enter Date (YYYY-MM-DD free text)
    │       ↓
    │   Select Time Slot (interactive list, up to 10 slots)
    │       ↓
    │   Enter Full Name (free text)
    │       ↓
    │   Select Preferred Call Time (morning / noon / evening)
    │       ↓
    │   ✅ Booking Confirmed (summary message)
    │
    ├── 🎁 Offers & Discounts
    │       → Shows active offers from database
    │       → Option to proceed to booking
    │
    └── 📞 Contact Us
            → Clinic phone + email + hours
```

**Smart features:**
- Session persistence per phone number (30-minute timeout) using the `WhatsAppSession` database table
- Expired sessions auto-reset to main menu
- Holiday detection — bot suggests alternative dates when chosen date is a holiday
- Double-booking prevention — rejects already-booked slots
- Greeting triggers: مرحبا، احجز، hi، hello، start، book، هلا، رئيسية، and more
- Fallback to numbered plain-text list if interactive list fails
- Google Calendar sync on booking creation
- Source tagged as `whatsapp` for analytics

---

## Instagram Bot

Automated Arabic-language booking assistant integrated with the **Meta Instagram Messaging API** (Instagram DMs).

**Webhook endpoints:**
- `GET /api/instagram/webhook` — Meta webhook verification
- `POST /api/instagram/webhook` — Incoming DM handler

**Identical flow to WhatsApp** with one key difference:

After entering their name, Instagram users are asked for their **WhatsApp phone number** — because Instagram DMs cannot receive phone calls or WhatsApp reminders:

```
Enter Full Name (free text)
    ↓
📱 Enter WhatsApp Number (free text, validated)
    ↓
Select Preferred Call Time
    ↓
✅ Booking Confirmed
```

**Instagram-specific adaptations:**
- Instagram DMs do not support interactive list UI — the bot sends **numbered plain-text menus** instead
- Numeric replies ("1", "2", "3") are resolved to the correct option IDs via a step-aware resolver
- Session IDs are prefixed with `ig_` to share the same `WhatsAppSession` database table without collision
- WhatsApp number is stored in the booking `notes` field and used as the `phone` field for reminder delivery
- Source tagged as `instagram` for analytics

---

## User Management

Admin interface for managing staff accounts. Only accessible to `superadmin` and `admin` roles.

**Features:**
- View all users with status, role, last login, and approval date
- Approve / reject / suspend accounts
- Change user role (admin ↔ superadmin ↔ doctor)
- Delete users
- Filter by status or role
- Pending approval count badge in the UI
- Superadmin-only: manage other superadmin accounts

All user status and role changes are recorded in the audit log.

---

## Audit Logs

Complete, tamper-evident record of every administrative action taken in the system.

**Every log entry captures:**
- **Who:** User name, email, role, user ID
- **What:** Action type (e.g. `UPDATE_DOCTOR`, `CREATE_BOOKING`, `LOGIN`)
- **Which:** Entity type (Doctor, Booking, User, Offer, etc.) + entity ID
- **Details:** Before/after field diff for updates, summary for creates/deletes
- **When:** Timestamp
- **Where:** IP address + User-Agent string
- **Result:** `success` or `failure`

**Actions logged:**
| Action | Trigger |
|---|---|
| `LOGIN` | Successful user login |
| `CREATE_DOCTOR` | New doctor added |
| `UPDATE_DOCTOR` | Doctor profile or schedule changed (with field diff) |
| `DEACTIVATE_DOCTOR` | Doctor soft-deleted |
| `CREATE_BOOKING` | New booking created |
| `UPDATE_BOOKING` | Booking status or details changed |
| `DELETE_BOOKING` | Booking deleted |
| `DRAG_DROP_BOOKING` | Booking rescheduled via drag-and-drop |
| `BLOCK_SLOT` | Time slot blocked |
| `UNBLOCK_SLOT` | Time slot unblocked |
| `CREATE_OFFER` | New offer created |
| `UPDATE_OFFER` | Offer edited |
| `DELETE_OFFER` | Offer deleted |
| `CREATE_HOLIDAY` | Holiday added |
| `DELETE_HOLIDAY` | Holiday removed |
| `UPDATE_USER_STATUS` | User approved/rejected/suspended |
| `UPDATE_USER_ROLE` | User role changed |
| `DELETE_USER` | User account deleted |

**UI features:**
- Paginated log viewer (50 per page)
- Filter by user, action, entity, and date range
- Expandable detail panel per log entry

---

## Internationalization (AR/EN)

Full bilingual support for Arabic and English throughout the entire application.

- **Language toggle** available on every screen (including the login page)
- **RTL layout** — the entire UI mirrors for Arabic (sidebar, text alignment, calendar, DataGrid columns)
- **Arabic font:** Cairo / Tajawal
- **English font:** DM Sans
- **All labels, buttons, error messages, and notifications** translated
- **Doctor names** stored in both languages — displayed in the user's selected language
- **Bot messages** — WhatsApp and Instagram bots communicate exclusively in Arabic
- **Date formatting** — Arabic locale (`ar-SA`) applied to all date displays in Arabic mode
- **Language preference** stored per user account (`preferredLang` field)

---

## Google Calendar Integration

Two-way integration with Google Calendar via the Google Calendar API (OAuth2).

**What syncs:**
- New bookings → creates Calendar event on the doctor's calendar
- Updated bookings (date/time change) → updates the Calendar event
- Deleted bookings → deletes the Calendar event
- Blocked slots → creates "Unavailable" event on the calendar
- Unblocked slots → deletes the Calendar event

**Configuration required:**
- Google OAuth2 credentials (Client ID, Client Secret, Redirect URI, Refresh Token)
- Each doctor has a `calendarId` field (can be `primary` or a specific calendar ID)

**Non-fatal:** If Calendar sync fails (missing credentials, API error), the booking is still created/updated normally. Calendar sync errors are logged but do not surface to the user.

**Dashboard sync button:** Admins can trigger a manual sync from the Doctors page to pull existing events from a doctor's Google Calendar.

---

## API Reference

All API routes are under `/api/`. Protected routes require `Authorization: Bearer <token>`.

### Authentication
| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | ❌ | Register new user |
| POST | `/api/auth/login` | ❌ | Login, returns JWT token |
| GET | `/api/auth/me` | ✅ | Get current user |
| POST | `/api/auth/forgot-password` | ❌ | Request password reset |
| POST | `/api/auth/reset-password/[token]` | ❌ | Reset password with token |
| GET | `/api/auth/users` | ✅ Admin | List all users |
| PATCH | `/api/auth/users/[id]/status` | ✅ Admin | Change user status |
| PATCH | `/api/auth/users/[id]/role` | ✅ Admin | Change user role |
| DELETE | `/api/auth/users/[id]` | ✅ Admin | Delete user |

### Doctors
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/doctors` | ❌ | List active doctors |
| POST | `/api/doctors` | ✅ | Create doctor |
| GET | `/api/doctors/[id]` | ❌ | Get doctor by ID |
| PUT | `/api/doctors/[id]` | ✅ | Update doctor |
| DELETE | `/api/doctors/[id]` | ✅ | Deactivate doctor |

### Bookings
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/bookings` | ❌ | List bookings (filterable) |
| POST | `/api/bookings` | ❌ | Create booking |
| GET | `/api/bookings/available-slots` | ❌ | Get available time slots |
| GET | `/api/bookings/[id]` | ❌ | Get booking by ID |
| PUT | `/api/bookings/[id]` | ❌ | Update booking |
| DELETE | `/api/bookings/[id]` | ❌ | Delete booking |
| PATCH | `/api/bookings/[id]/drag-drop` | ❌ | Reschedule (drag-and-drop) |

### Blocked Slots
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/blocked-slots` | ❌ | List blocked slots |
| POST | `/api/blocked-slots` | ✅ | Block a slot |
| DELETE | `/api/blocked-slots/[id]` | ✅ | Unblock a slot |

### Offers
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/offers` | ❌ | List offers |
| POST | `/api/offers` | ✅ Admin | Create offer |
| PUT | `/api/offers/[id]` | ✅ Admin | Update offer |
| DELETE | `/api/offers/[id]` | ✅ Admin | Delete offer |

### Holidays
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/holidays` | ❌ | List holidays |
| POST | `/api/holidays` | ✅ Admin | Create holiday |
| DELETE | `/api/holidays/[id]` | ✅ Admin | Delete holiday |

### Dashboard & Logs
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard/stats` | ❌ | Get dashboard statistics |
| GET | `/api/audit-logs` | ✅ Admin | List audit logs (paginated) |

### Bots
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/whatsapp/webhook` | ❌ | WhatsApp webhook verification |
| POST | `/api/whatsapp/webhook` | ❌ | WhatsApp incoming message |
| POST | `/api/whatsapp/reminder/[id]` | ✅ | Send WhatsApp reminder |
| GET | `/api/instagram/webhook` | ❌ | Instagram webhook verification |
| POST | `/api/instagram/webhook` | ❌ | Instagram incoming DM |
| GET | `/api/health` | ❌ | Health check |

---

## Data Models

### User
```
id, name, email, password (hashed), role, status, preferredLang,
doctorId (optional link), approvedById, approvedAt,
resetPasswordToken, resetPasswordExpires, lastLogin,
createdAt, updatedAt
```

### Doctor
```
id, nameEn, nameAr, specialtyEn, specialtyAr, phone, email, calendarId,
workingStart, workingEnd, workingDays (int[]),
breakEnabled, breakStart, breakEnd, breakDuration,
slotDuration, isActive, createdAt, updatedAt
```

### Booking
```
id, name, phone, service, date, time, status, notes, doctorId,
calendarEventId, calendarLink, calendarSynced,
reminderSent, reminderSentAt, source, createdAt, updatedAt
```

### BlockedSlot
```
id, doctorId, date, time (nullable), reason,
isWholeDay, syncedToGoogle, googleEventId,
blockedById, createdAt, updatedAt
```

### Offer
```
id, titleEn, titleAr, descriptionEn, descriptionAr,
imageUrl, imageBase64, code, isActive, expiresAt,
createdById, createdAt, updatedAt
```

### Holiday
```
id, type (weekly|date), dayOfWeek, date, nameEn, nameAr,
applyToAll, doctors (many-to-many), createdById, createdAt, updatedAt
```

### AuditLog
```
id, userId, userName, userEmail, action, entity, entityId,
details (JSON), ip, userAgent, status, createdAt, updatedAt
```

### WhatsAppSession
```
id, phone (unique, prefixed with ig_ for Instagram),
step, data (JSON), expiresAt, createdAt, updatedAt
```

---

## What This Project Does NOT Have

To set clear expectations, the following features are **not** in this project:

| Missing Feature | Notes |
|---|---|
| **Waitlist** | No waiting list or queue system for fully-booked slots |
| **Patient portal** | Patients cannot log in — they interact only via bots |
| **Online payments** | No payment gateway integration |
| **SMS notifications** | Only WhatsApp messaging; no SMS |
| **Email notifications** | Password reset URL is logged to console; no SMTP integration |
| **Multi-clinic / multi-branch** | Single clinic instance only |
| **Medical records / EMR** | No patient history, prescriptions, or medical data |
| **Video consultations** | No telemedicine integration |
| **Recurring appointments** | Bookings are single-occurrence only |
| **Patient self-service web portal** | No public-facing booking website |
| **Push notifications** | No mobile push notifications |
| **Two-factor authentication** | JWT only, no 2FA |
| **Reporting exports** | No PDF/Excel export from the dashboard |
| **Insurance billing** | No insurance or claims management |

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://USER:PASS@HOST:5432/smartclinic"

# Auth
JWT_SECRET="your-long-random-secret"

# WhatsApp Cloud API
WHATSAPP_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Instagram Messaging API
INSTAGRAM_TOKEN=your_instagram_page_access_token
INSTAGRAM_VERIFY_TOKEN=your_verify_token

# Google Calendar API
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/google/oauth2callback
GOOGLE_REFRESH_TOKEN=your_refresh_token

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2 (App Router) |
| Frontend | React 18, MUI v5, FullCalendar v6, Recharts |
| Language | TypeScript (backend), JavaScript (frontend components) |
| Database | PostgreSQL |
| ORM | Prisma 5 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Calendar | Google Calendar API v3 |
| Messaging | Meta WhatsApp Cloud API + Meta Instagram Messaging API |
| Deployment | Vercel |
| Styling | MUI + Emotion (CSS-in-JS) |
| State | React Context (auth + lang) |
| Routing | React Router v6 (SPA inside Next.js) |
