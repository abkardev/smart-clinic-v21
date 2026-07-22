# SmartClinic

> Enterprise-grade clinic management platform with multi-channel booking, WhatsApp/Instagram bots, and Google Calendar sync.

![Next.js](https://img.shields.io/badge/Next.js-14.2-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791)
![Prisma](https://img.shields.io/badge/Prisma-5.13-2D3748)
![MUI](https://img.shields.io/badge/MUI-5.15-007FFF)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Architecture

SmartClinic follows a **monorepo** structure with a **Next.js 14 App Router** frontend and backend combined in a single project.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Edge / CDN (Vercel)                     │
├─────────────────────────────────────────────────────────────────┤
│                      Next.js 14 App Router                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Client SPA  │  │  API Routes  │  │  Middleware (Edge)     │  │
│  │  (React/MUI) │  │  (Node.js)   │  │  Auth + Logging       │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────────────────┘  │
│         │                 │                                       │
│         ▼                 ▼                                       │
│  ┌────────────────────────────────────────────────────────┐       │
│  │                   Prisma ORM                            │       │
│  └──────────────────────┬─────────────────────────────────┘       │
│                         │                                         │
├─────────────────────────┼─────────────────────────────────────────┤
│                         ▼                                         │
│               ┌──────────────────┐                                │
│               │   PostgreSQL     │                                │
│               │   (Neon)         │                                │
│               └──────────────────┘                                │
│                                                                   │
│  External Integrations:                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌────────┐        │
│  │ WhatsApp  │  │ Instagram│  │ Google       │  │ Sentry │        │
│  │ Cloud API │  │ Graph API│  │ Calendar API │  │ Errors │        │
│  └──────────┘  └──────────┘  └──────────────┘  └────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Client** → React SPA communicates with API routes via axios
2. **API Routes** → Handle business logic, auth, and data access
3. **Middleware** → Edge-level auth checking, correlation IDs, security headers
4. **Prisma** → Type-safe database access with PostgreSQL
5. **External APIs** → WhatsApp/Instagram bots, Google Calendar sync, Sentry error tracking

### Key Design Decisions

- **Single-page application** — All pages are client-rendered with `force-dynamic`. Authentication is managed via JWT stored in localStorage.
- **Server-side analytics** — The `/api/analytics/overview` endpoint computes aggregation in SQL, not JavaScript.
- **Webhook-first bots** — WhatsApp and Instagram bots operate entirely through webhooks with in-memory state management.
- **Date-scoped queries** — All report and analytics endpoints enforce mandatory date ranges with a 365-day maximum to prevent full-table scans.

---

## Folder Structure

```
smartclinic-nextjs-v21/
├── .github/workflows/       # CI pipeline
├── docs/                    # Deployment, monitoring, backup guides
├── prisma/
│   └── schema.prisma        # Database schema
├── public/                  # Static assets
├── src/
│   ├── app/
│   │   ├── api/             # Next.js API routes
│   │   │   ├── analytics/
│   │   │   ├── auth/
│   │   │   ├── blocked-slots/
│   │   │   ├── bookings/
│   │   │   ├── dashboard/
│   │   │   ├── doctors/
│   │   │   ├── email-reminder/
│   │   │   ├── holidays/
│   │   │   ├── instagram/
│   │   │   ├── offers/
│   │   │   ├── reports/
│   │   │   ├── whatsapp/
│   │   │   ├── health/
│   │   │   └── metrics/
│   │   ├── lib/             # Shared utilities
│   │   └── global-error.tsx # Sentry error boundary
│   ├── context/             # React context providers
│   ├── pages_/              # Page components (renamed from pages/ to avoid Pages Router conflict)
│   ├── services/            # API client
│   └── middleware.ts        # Edge middleware
├── sentry.client.config.ts  # Sentry client config
├── sentry.server.config.ts  # Sentry server config
├── sentry.edge.config.ts    # Sentry edge config
├── instrumentation.ts       # Next.js instrumentation
├── Dockerfile               # Production Docker image
├── docker-compose.yml       # Docker Compose for production
├── next.config.js           # Next.js configuration
├── package.json
└── tsconfig.json
```

---

## Features

### Booking Management
- Multi-service appointment booking
- Real-time availability calendar (FullCalendar)
- Drag-and-drop rescheduling
- Status management (pending, confirmed, completed, cancelled, no-show)
- WhatsApp reminder sending

### Multi-Channel Chatbots
- **WhatsApp** — Automated booking flow via WhatsApp Cloud API
- **Instagram** — Automated booking flow via Instagram Graph API
- Smart conversation routing with in-memory session state
- Duplicate message detection

### Analytics & Reporting
- Dashboard with key metrics (bookings, completions, cancellations)
- Trend analysis (daily, monthly)
- Doctor performance breakdown
- Peak hours analysis
- Export to PDF, Excel, CSV
- All queries date-scoped with 365-day max

### Administration
- Role-based access: superadmin, admin, doctor
- Doctor management with working hours and slot duration
- Holiday configuration
- Blocked slot management
- Offer management
- Audit logging
- User management (approval, role assignment)

### Integrations
- **WhatsApp Cloud API** — Two-way messaging, interactive lists, quick replies
- **Instagram Graph API** — Two-way messaging, quick replies
- **Google Calendar API** — Automatic event creation for bookings (optional)
- **Sentry** — Error tracking and performance monitoring
- **Neon** — Serverless PostgreSQL with PITR backups

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript 5.4 |
| **UI** | React 18, MUI 5, Recharts |
| **Calendar** | FullCalendar 6 |
| **Database** | PostgreSQL (Neon) |
| **ORM** | Prisma 5 |
| **Auth** | JWT (jsonwebtoken + bcryptjs) |
| **Bots** | WhatsApp Cloud API, Instagram Graph API |
| **Calendar Sync** | Google Calendar API (googleapis) |
| **Error Tracking** | Sentry |
| **PDF** | jsPDF |
| **Excel** | xlsx |
| **Email** | Resend |
| **Storage** | Vercel Blob |
| **Testing** | Vitest |
| **CI** | GitHub Actions |
| **Container** | Docker |
| **Hosting** | Vercel |

---

## Installation

### Prerequisites

- Node.js 22+
- PostgreSQL (local or Neon)
- npm

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/smartclinic-nextjs-v21.git
cd smartclinic-nextjs-v21

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# 4. Generate Prisma client
npx prisma generate

# 5. Run database migrations
npx prisma migrate dev

# 6. (Optional) Seed the database
npx prisma db seed

# 7. Start development server
npm run dev
```

The application will be available at `http://localhost:3000`.

---

## Build

```bash
# Production build
npm run build

# TypeScript check only
npx tsc --noEmit

# Lint
npm run lint
```

---

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel Dashboard
3. Configure environment variables
4. Deploy

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for full instructions.

### Docker

```bash
# Build
docker compose build

# Run
docker compose up -d

# Check health
curl http://localhost:3000/api/health
```

---

## API

### Authentication

All API routes (except public ones) require a Bearer JWT token in the `Authorization` header.

**Public endpoints:**
- `POST /api/auth/login` — Login
- `POST /api/auth/register` — Register
- `POST /api/auth/forgot-password` — Request password reset
- `POST /api/auth/reset-password/[token]` — Reset password
- `GET /api/health` — Health check

### Core Resources

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/bookings` | List/Create bookings |
| GET/PUT/DELETE | `/api/bookings/[id]` | Single booking CRUD |
| PATCH | `/api/bookings/[id]/drag-drop` | Drag-and-drop reschedule |
| GET | `/api/bookings/available-slots` | Available time slots |
| GET/POST | `/api/doctors` | List/Create doctors |
| GET/PUT/DELETE | `/api/doctors/[id]` | Single doctor CRUD |
| GET/POST | `/api/offers` | List/Create offers |
| GET/PUT/DELETE | `/api/offers/[id]` | Single offer CRUD |
| GET | `/api/analytics/overview` | Analytics data |
| GET | `/api/reports/appointments` | Appointments report |
| GET | `/api/reports/doctors` | Doctors performance report |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/audit-logs` | Audit trail |

---

## Security

- **JWT Authentication** — All API routes protected by JWT bearer tokens
- **Webhook Signature Verification** — HMAC-SHA256 for WhatsApp and Instagram webhooks
- **Security Headers** — X-Content-Type-Options, X-Frame-Options, HSTS via Edge middleware
- **Input Validation** — Server-side validation on all mutation endpoints
- **Rate Limiting** — Login, registration, and password reset endpoints rate-limited
- **Correlation IDs** — Every request gets a unique correlation ID for tracing
- **Secrets Management** — All secrets via environment variables, never hardcoded
- **Dependency Scanning** — Regular `npm audit` recommended

---

## Monitoring

| Tool | Purpose | Configuration |
|---|---|---|
| Sentry | Error tracking & performance | `NEXT_PUBLIC_SENTRY_DSN` |
| Health endpoint | Uptime monitoring | `GET /api/health` |
| Structured logs | Debugging & auditing | `LOG_LEVEL` |
| Neon Dashboard | Database monitoring | Automatic |

See [docs/MONITORING.md](./docs/MONITORING.md) for details.

---

## Backup

- **Database**: Neon PITR (automatic) + pg_dump (manual)
- **Blob Storage**: Vercel Blob (manual backup)

See [docs/BACKUP.md](./docs/BACKUP.md) for procedures.

---

## License

MIT
