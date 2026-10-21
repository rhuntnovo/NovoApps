# NovoApps

New Vines Learning is published at https://novoapps-newvines.rhuntnovo.workers.dev as v0.8.3.
The local Content Studio imports and manages draft content without publishing it.

Read [AGENTS.md](AGENTS.md), [the platform architecture](docs/NEW_VINES_PLATFORM_ARCHITECTURE.md),
and [the architecture decisions](docs/ADR/) before changing the platform.

## Local Content Studio

From this repository root, with Node 24 and npm:

```powershell
npm.cmd install
npm.cmd run dev:cms
```

Open **http://127.0.0.1:5174/**. Use this exact loopback address; the preview origin is explicit.

The launcher applies migrations to **local** D1, starts the Hono API on 127.0.0.1:8787,
imports the existing Module 1 once, and starts the editor and isolated preview.
Subsequent starts keep existing drafts. Ctrl+C stops the development servers.
No Cloudflare login, API key, remote database, or deployment is required for this milestone.

You can browse all 20 pages; edit layouts, block order, reflections, and narration scripts;
explicitly unlock wording changes for review; save draft revisions; and preview the real
Self Paced / Guided experience at phone, tablet, and desktop sizes. Export draft downloads
JSON for review and does not publish it. Existing icons, image references, recordings,
and canonical published IDs are preserved.

Local D1 state is in `services/api-worker/.wrangler/state/` and is ignored by Git.
Keep this directory if you want to keep drafts. Git tracks the schema/migrations/source,
not your local database. Re-importing never overwrites an existing module.
The local draft history is append-only; a failed/stale save leaves existing revisions intact.

## Repository layout

- `newvines-learning/`: independent Preact learner app, existing package/lockfile.
- `apps/cms-web/`: React authoring UI.
- `apps/cms-preview/`: Preact iframe entry that uses the existing learner renderer and local media.
- `services/api-worker/`: Hono API with a local D1 binding.
- `packages/content-model/`: framework-neutral schema 0.3 validation and contracts.
- `database/content/`: Drizzle schema and generated migrations.
- `tooling/`: local launcher and curriculum importer.
- `docs/`: architecture, decisions, and [CMS milestone details](docs/09-LOCAL-CMS-MILESTONE.md).

The root npm workspace covers the new apps/services/packages. Learning remains independently
buildable and deployable; it has not been moved or converted to React.

## Checks

```powershell
npm.cmd run test:cms
npm.cmd run build:cms
```

The CMS tests cover exact content round-tripping, stable IDs, media paths, concurrent saves,
wording protection/review flags, and local-only API access. The API tests use Node's SQLite
with a small D1-binding adapter; the pilot is also exercised against Wrangler's actual local D1.
Generate a migration after changing the schema:

```powershell
npm.cmd run db:generate --workspace @novoapps/api-worker
npm.cmd run cms:migrate
```

An explicit dependency override pins the legacy Drizzle loader's nested esbuild to 0.25.12
to avoid its old development-server advisory. Schema generation was checked with this override.

## Before online deployment

This milestone intentionally has no public authoring endpoint. The API requires both the
local authoring opt-in and a loopback host, and rejects untrusted browser origins.
A production deployment has no configured database or local-authoring opt-in.

Next, implement and validate Better Auth with `nvi-control`, content permissions and audit
identity; then add review/approval and immutable R2 publication. Asset upload/generation,
translation workflow, creating/removing pages or blocks, and publication remain future work.
Changing a narration script does not regenerate its existing recording.

Do not deploy the local authoring bypass or treat it as authentication. Shared authoring,
real registration, and cloud database provisioning are separate implementation steps.
