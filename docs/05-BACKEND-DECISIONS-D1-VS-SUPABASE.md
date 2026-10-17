# Backend Decision --- Cloudflare D1/R2 vs Supabase

Status: **not finally locked**.

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

## Current posture

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
