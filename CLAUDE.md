# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Development server with hot reload
pnpm build        # Production build (Vite + esbuild)
pnpm start        # Run production build
pnpm test         # Run all 24 Vitest tests
pnpm check        # TypeScript type check (no emit)
pnpm format       # Prettier formatting
pnpm db:push      # Sync Drizzle schema to database
```

**Run a single test file or test by name:**
```bash
npx vitest run server/batch.test.ts
npx vitest run server/batch.test.ts -t "batch configuration"
```

## Architecture

This is a full-stack React + Express + tRPC app for batch purchase order (OC) verification and synchronization against an external supplier portal API.

**Stack:** React 19 + Vite, Express 4, tRPC 11, Drizzle ORM, MySQL/TiDB, TailwindCSS 4, shadcn/ui, Zod, TanStack Query 5.

**Communication layer:** All client-server communication goes through tRPC (HTTP POST to `/api/trpc`). Zod validates all inputs. There is no REST API — everything is a tRPC procedure.

**Multi-tenancy:** Each tenant is identified by a `clientKey` URL param. The `clients` table stores per-tenant API credentials, batch config, sync rules, and branding color. The active client is resolved server-side and passed to all `egixia.*` procedures.

**Auth:** Two parallel auth systems:
1. Manus OAuth — for regular users (handles session via cookies)
2. Magic link / admin session — for admin management pages (`/admin`, `/clients`, `/logs`)

### Key directories

- `client/src/contexts/OCSyncContext.tsx` — Central state store for the entire upload → verify → sync workflow. All records, KPIs, selection state, and step live here.
- `client/src/contexts/ClientKeyContext.tsx` — Resolves and exposes the active tenant's client data.
- `client/src/hooks/useOCVerification.ts` — Orchestrates the multi-step verification workflow (calls tRPC batched procedures).
- `server/routers.ts` — All tRPC router definitions (~1300 lines). Main routers: `auth`, `egixia`, `clients`, `logs`, `system`.
- `server/db.ts` — Database helper functions (no raw SQL in routers).
- `drizzle/schema.ts` — Source of truth for all DB tables: `users`, `clients`, `verificationLogs`, `magicLinks`, `integrationLogs`.
- `server/_core/` — Express server setup, tRPC middleware, OAuth, cookies, context.

### Workflow data flow

1. **Upload** — `DataUploader.tsx` parses Excel/CSV client-side via `lib/file-parser.ts`, populates `OCSyncContext.records[]`
2. **Supplier check** — parallel batch calls to `egixia.checkSupplierExists()`, sets `record.supplierExists`
3. **Verify OCs** — `egixia.verifyPurchaseOrders()` calls Egixia API `POST /apimanager/purchase_order_v1/list`, sets `record.status`
4. **Sync** — `egixia.synchronizeBatch()` calls `POST /apimanager/purchase_order_v1/synchronize_purchase_order` per selected OC
5. **Export** — CSV generated client-side from context state

Every API call to the Egixia portal is stored in the `integrationLogs` table (URL, request/response bodies, status, duration).

### Batch processing

Configured per client (`batchSize` 1–100, `batchDelaySeconds` 1–60). The server processes OCs in sequential batches with configurable delays to avoid overwhelming the supplier API. Default: batches of 10 with 3s delay, 4 parallel groups.

### Testing pattern

Tests use the tRPC direct caller — no HTTP mocking:
```typescript
const caller = appRouter.createCaller({} as any);
const result = await caller.clients.create({ ... });
```

Tests live in `server/**/*.test.ts` and `server/**/*.spec.ts`. No client-side tests.

### Environment variables

Required: `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`, `OWNER_NAME`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_URL`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`.

See `.env.example` for the full list. In dev, missing SendGrid config falls back to console-logging the magic link.
