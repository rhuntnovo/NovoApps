# Backend Decision --- Cloudflare D1/R2 vs Supabase

Status: **Background comparison; current direction is in NEW_VINES_PLATFORM_ARCHITECTURE.md and ADR 0003–0005.**

## Supabase

Strengths: PostgreSQL, Auth, RLS, Storage, client SDK/APIs, relational
queries, centralized migrations/admin. Earlier platform model included
`profiles`, `workspaces`, `workspace_members`, then domain tables.
Shared Postgres + `workspace_id` + RLS is operationally simple.

Tradeoffs: RLS correctness is critical; direct client coupling;
encrypted domain payload reduces server-side relational/reporting value;
available regions may not satisfy every country.

## Cloudflare D1

Attractive because Cloudflare already hosts the PWA; SQLite is simple;
D1-per-workspace can provide strong isolation; encrypted generic sync
records fit well; Workers can be Sync API/router; R2 suits public
educational assets.

D1-per-workspace costs: provisioning, fleet migrations, backup/restore,
analytics, tooling, and provider limits. Verify current Cloudflare
limits before committing to thousands of workspaces.

## Storage hybrid

Prior preference: - Cloudflare R2/CDN: public educational resources -
Supabase private Storage: workspace/user files if Supabase is used -
client-side image optimization before user-file upload

Auth, sync protocol, encrypted data storage, and public content storage
should remain conceptually separable.

## Earlier posture

Supabase is simpler for an early integrated MVP
(registration/auth/workspaces/RLS/admin). Cloudflare Worker +
D1-per-workspace is especially attractive for longer-term generic
encrypted sync and strong isolation.

Reasonable evolution: 1. stabilize domain/local DB/sync protocol
independent of provider 2. use simplest backend for MVP 3. preserve Sync
API abstraction 4. revisit provider/region per workspace before broad
international rollout

Neither provider should be assumed to offer suitable in-country regions
everywhere. Verify current regions/law at rollout.

## Current decision (October 20, 2026)

ADR 0004 accepts separate Cloudflare D1 databases for nvi-control and nvi-content.
The first CMS uses Wrangler local D1 only. No remote database has been provisioned.
Better Auth for central identity and SQLite-backed Durable Objects for workspace operational
data are preferred proposals (ADR 0003/0005), pending implementation/operational validation.
They replace the earlier Supabase-first leaning as the work direction, not as a claim that
auth/session, recovery, backup, cost, or data-residency questions are already solved.

D1 and Durable Objects SQLite are distinct products with different access/lifecycle models.
Keep central identity and content out of per-workspace operational databases.
Retain the provider/API and public/private storage boundaries described above.
