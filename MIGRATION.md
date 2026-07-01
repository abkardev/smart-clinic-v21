# SmartClinic — Migration Guide
## From: React (Vite/CRA) + Express + MongoDB/Mongoose
## To: Next.js 14 App Router + PostgreSQL + Prisma

---

## What Changed & Why

| Layer | Before | After |
|---|---|---|
| **Frontend framework** | React (Vite SPA) + separate Express backend | Next.js 14 (SPA + API Routes in one project) |
| **Backend** | Express.js on port 5000 | Next.js API Routes at `/api/*` (same origin) |
| **Database** | MongoDB (Mongoose ODM) | PostgreSQL (Prisma ORM) |
| **IDs** | MongoDB ObjectId (`_id`) | CUID strings (`id`) |
| **Deployment** | 2 separate processes (frontend + backend) | 1 unified Next.js process |
| **CORS** | Required (cross-origin) | Not needed (same origin) |

---

## Quick Start

### 1. Install Dependencies

```bash
cd smartclinic-nextjs
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# PostgreSQL — Supabase, Railway, Neon, or local
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/smartclinic?schema=public"

JWT_SECRET="your-secret-here-change-in-production"

# WhatsApp Cloud API (optional)
WHATSAPP_TOKEN=your_token
WHATSAPP_PHONE_ID=your_phone_id
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Google Calendar (optional)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/oauth2callback
GOOGLE_REFRESH_TOKEN=your_refresh_token

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set Up the Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to your PostgreSQL database
npm run db:push

# Seed with sample data (creates superadmin + doctors + bookings)
npm run db:seed
```

### 4. Run Development Server

```bash
npm run dev
# → http://localhost:3000
```

**Login:** `admin@smartclinic.sa` / `Admin@12345`

---

## Key Architecture Decisions

### Single Next.js Project
The old project had:
- `frontend/` — Vite React app on port 3000
- `backend/` — Express API on port 5000

The new project is **one unified Next.js app**:
- `src/app/` — App Router (API routes + page shell)
- `src/components/`, `src/pages/` — React SPA components (unchanged)
- `src/app/api/` — All backend logic (replaces Express)

### Prisma Schema Mapping (Mongoose → Prisma)

| Mongoose | Prisma |
|---|---|
| `mongoose.Schema.Types.ObjectId` | `String @id @default(cuid())` |
| `{ type: String, enum: [...] }` | `enum MyEnum { ... }` |
| `ref: 'Model'` | Prisma `@relation()` |
| `Mixed` type | `Json` |
| `{ timestamps: true }` | `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt` |
| MongoDB compound index | `@@unique([field1, field2])` |
| `$regex` queries | `{ contains: x, mode: 'insensitive' }` |
| `$group` aggregation | `prisma.model.groupBy(...)` |
| `$lookup` / `populate()` | `include: { relation: true }` |
| `countDocuments({ field: { $regex: '^YYYY-MM' } })` | `count({ where: { field: { startsWith: 'YYYY-MM' } } })` |

### ID Field Change
MongoDB uses `_id`, PostgreSQL uses `id`. The API responses now return `id` instead of `_id`.

**Frontend impact:** The frontend pages use `b._id` in some places — if you see issues, find/replace `._id` → `.id` in `src/pages/`.

### BookedSlot `no_show` Enum
Prisma enum values can't contain hyphens. `no-show` is stored as `no_show` in PostgreSQL, mapped via `@map("no-show")` so the API still sends/receives `"no-show"` correctly.

### WorkingHours Flattening
Mongoose stored `workingHours: { start, end }` as a nested object. Prisma flattens this to `workingStart` and `workingEnd` columns for better queryability. The API routes handle the translation transparently (accepts both formats on write, always returns flat fields).

---

## API Routes (Express → Next.js)

All routes are functionally identical. URL paths are preserved:

| Express | Next.js App Router |
|---|---|
| `POST /api/auth/login` | `src/app/api/auth/login/route.ts` |
| `GET /api/doctors` | `src/app/api/doctors/route.ts` |
| `PUT /api/doctors/:id` | `src/app/api/doctors/[id]/route.ts` |
| `GET /api/bookings/available-slots` | `src/app/api/bookings/available-slots/route.ts` |
| `PATCH /api/bookings/:id/drag-drop` | `src/app/api/bookings/[id]/drag-drop/route.ts` |
| `PATCH /api/auth/users/:id/status` | `src/app/api/auth/users/[id]/status/route.ts` |

---

## Database Setup Options

### Option A: Local PostgreSQL
```bash
createdb smartclinic
DATABASE_URL="postgresql://postgres:password@localhost:5432/smartclinic"
```

### Option B: Supabase (Free tier)
1. Create project at supabase.com
2. Settings → Database → Connection string → URI
3. Use the connection string as `DATABASE_URL`

### Option C: Neon (Serverless PostgreSQL)
1. Create project at neon.tech
2. Copy the connection string
3. Use as `DATABASE_URL`

### Option D: Railway
1. `railway init` → Add PostgreSQL plugin
2. `railway variables` to get `DATABASE_URL`

---

## Migrating Existing MongoDB Data

If you have production data in MongoDB to migrate:

```bash
# 1. Export from MongoDB
mongoexport --db smartclinic --collection bookings --out bookings.json
mongoexport --db smartclinic --collection doctors --out doctors.json
# ... etc

# 2. Run the migration script
# (Write a custom script using prisma.booking.createMany() etc.)
# Key transformations needed:
#   - _id (ObjectId string) → id (any string, keep as-is)
#   - doctorId ObjectId → doctorId string (keep hex string)
#   - no-show status → no_show (Prisma enum)
#   - nested workingHours → flat workingStart/workingEnd
```

---

## Deploying to Production

### Vercel (recommended for Next.js)
```bash
npm i -g vercel
vercel

# Set environment variables in Vercel dashboard:
# DATABASE_URL, JWT_SECRET, GOOGLE_*, WHATSAPP_*
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables for Production
- Set `DATABASE_URL` to your production PostgreSQL connection string
- Set `JWT_SECRET` to a long random string (never commit this)
- Set `NEXT_PUBLIC_APP_URL` to your production domain

---

## Prisma Management Commands

```bash
npm run db:generate   # Regenerate Prisma client after schema changes
npm run db:push       # Push schema changes to DB (no migration file, good for dev)
npm run db:migrate    # Create a migration file + apply (use in production)
npm run db:studio     # Open Prisma Studio (visual DB browser)
npm run db:seed       # Run seed file
```

---

## File Structure

```
smartclinic-nextjs/
├── prisma/
│   ├── schema.prisma          ← Full data model (all 8 models)
│   └── seed.ts                ← Sample data seeder
├── src/
│   ├── app/
│   │   ├── layout.tsx         ← Root HTML layout
│   │   ├── page.tsx           ← Root page (loads SPA)
│   │   ├── [...slug]/page.tsx ← Catch-all for client-side routing
│   │   ├── lib/
│   │   │   ├── prisma.ts      ← Prisma singleton
│   │   │   ├── auth.ts        ← JWT helpers + route guard
│   │   │   ├── audit.ts       ← Audit logging helper
│   │   │   ├── availability.ts← Slot availability logic
│   │   │   ├── google.ts      ← Google Calendar OAuth client
│   │   │   └── googleCalendar.ts ← Calendar CRUD helpers
│   │   └── api/
│   │       ├── auth/          ← login, register, me, forgot-password, reset-password, users
│   │       ├── bookings/      ← CRUD + available-slots + drag-drop
│   │       ├── doctors/       ← CRUD
│   │       ├── dashboard/     ← stats
│   │       ├── blocked-slots/ ← block/unblock
│   │       ├── offers/        ← CRUD
│   │       ├── holidays/      ← CRUD
│   │       ├── audit-logs/    ← paginated logs
│   │       └── health/        ← health check
│   ├── components/
│   │   ├── App.jsx            ← React SPA root (React Router)
│   │   ├── Layout.jsx         ← Sidebar + AppBar shell
│   │   ├── LangToggle.jsx     ← EN/AR language switch
│   │   └── auth/              ← LoginPage, AuthPages
│   ├── pages/                 ← All 10 page components (unchanged from v11)
│   ├── context/               ← AppContext (auth + lang), translations
│   └── services/
│       └── api.js             ← Axios client (baseURL: /api)
├── .env.example
├── next.config.js
├── package.json
└── tsconfig.json
```
