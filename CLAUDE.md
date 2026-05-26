# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Express + Vite HMR concurrently)
pnpm build        # Build client to dist/public, bundle server to dist/index.js
pnpm start        # Run production build
pnpm test         # Run all Vitest tests (server only)
pnpm test -- --reporter=verbose  # Tests with full output
pnpm db:push      # Apply schema changes to MySQL via drizzle-kit
pnpm db:studio    # Open Drizzle Studio
```

Run a single test file:
```bash
pnpm vitest run server/batch.test.ts
```

There is no separate lint command; Prettier is configured via `.prettierrc`.

## Architecture Overview

Full-stack TypeScript monorepo (pnpm). Single server process serves both the tRPC API and the Vite-built React SPA.

```
client/src/    # React 19 + Tailwind 4 + shadcn/ui (Vite)
server/        # Express + tRPC 11 (Node/tsx)
shared/        # Types and constants shared by both sides
drizzle/       # MySQL schema (Drizzle ORM) + migrations
```

Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*`.

### Server

**Entry**: `server/_core/index.ts` — auto-discovers an available port in 3000–3019.

**Router**: `server/routers.ts` (~1350 lines) is the single `appRouter` with four sub-routers:
- `auth` — Manus OAuth login, magic-link admin access, session validation
- `egixia` — Core OC sync business logic (token test, batch verify suppliers, batch verify OCs, batch sync OCs)
- `clients` — Admin-only multi-tenant CRUD + connection test
- `logs` — Integration log retrieval and deletion

**Procedure guards** defined in `server/_core/trpc.ts`:
- `publicProcedure` — no auth required
- `protectedProcedure` — requires valid session cookie (`app_session_id` JWT)
- `adminProcedure` — requires `role = "admin"`

**Database**: Drizzle ORM with MySQL2. Schema in `drizzle/schema.ts`. Four main tables: `users`, `clients`, `magicLinks`, `integrationLogs`. Helpers in `server/db.ts`.

**Integration logging**: Every outbound Egixia API call is written to `integrationLogs` with full request/response bodies, timing, and HTTP status. Tokens are truncated to first 10 chars.

### Client

**Routing**: Wouter (not React Router). Routes defined in `client/src/App.tsx`.

**Global state**: `OCSyncContext` (`client/src/contexts/OCSyncContext.tsx`) holds the entire workflow state:
- `OCRecord[]` — current batch of purchase orders with their verification/sync status
- `KPIData` — aggregated counters
- `currentStep` (1–6) — controls which UI panel is shown

**Core business logic**: `client/src/hooks/useOCVerification.ts` (~32KB). This single hook drives the full workflow: file parsing → supplier verification → OC verification → sync. It calls tRPC endpoints with `clientKey` and handles retry logic for network errors (ECONNRESET, socket hang up).

**File parsing**: `client/src/lib/file-parser.ts` reads Excel/CSV via XLSX, maps column names case-insensitively (e.g. `buyer_external_code`, `codigo_comprador`), and preserves leading zeros.

**tRPC client**: `client/src/lib/trpc.ts` — standard React Query + tRPC setup.

### Multi-Tenant Model

Each deployment can carry a `?clientKey=<key>` URL parameter. The server reads this parameter in every `egixia.*` procedure to look up the client's credentials (baseUrl, userName, password, clientId, clientSecret) from the `clients` table. Admin routes use a separate cookie-based session.

Theme color can be customized per-client via `?rgb=RRGGBB` in the URL, which is consumed by `ThemeColorContext`.

### Batch Processing Pattern

The Egixia external API is called in groups:
- **Supplier verification**: 50 suppliers per call, parallel requests
- **OC verification**: configurable `batchSize` (default 10), `batchDelaySeconds` (default 3s) between groups
- **OC sync**: groups of up to 10 OCs sent as comma-separated string (e.g. `"3400313054,3400313050"`), 2s pause between groups

Batch config (`batchSize`, `batchDelaySeconds`, colors, sync rules) is returned by `egixia.getBatchConfig` and stored in the `clients` table.

### Auth Flow

Two separate auth paths:
1. **Manus OAuth** (`/auth/manus/login` → `/auth/manus/callback`) — for `@egixia.com` users
2. **Magic links** — admin sends email via SendGrid; token expires in 15 min, single-use; handled by `server/email.ts`

Sessions are JWT cookies signed with `JWT_SECRET` using the `jose` library.

## Environment Variables

See `.env.example`. Required: `DATABASE_URL`, `JWT_SECRET`, Manus OAuth credentials (`MANUS_CLIENT_ID`, `MANUS_CLIENT_SECRET`, `MANUS_REDIRECT_URI`). Optional: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (needed for magic links).

## Testing

Tests live in `server/**/*.test.ts`. Vitest runs in Node environment (no DOM). There are no frontend tests. The 7 test files cover: auth/logout, batch logic, client CRUD, connection testing, magic links, router behavior, and SendGrid.

Mocks are used for external API calls and the database in unit tests.
