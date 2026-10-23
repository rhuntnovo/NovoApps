# NovoApps

New Vines Learning is published as v0.8.4 with English/Spanish offline selection at
https://novoapps-newvines.rhuntnovo.workers.dev.
The local NovoApps Content Studio supports multiple providers and source-linked
language/regional drafts and explicit approved R2 publication. CMS and authoring D1 remain local pending authenticated hosting.

Read [AGENTS.md](AGENTS.md), [the architecture entry point](docs/ARCHITECTURE.md),
and relevant [ADRs](docs/ADR/) before changing the platform.

## Local Content Studio

From C:\Development\NovoApps, with Node 24 and npm:

```powershell
npm.cmd install
npm.cmd run dev:cms
```

Open **http://localhost:5174/** or **http://127.0.0.1:5174/**.
Refresh an editor left open from the earlier pilot.

The launcher migrates local D1, starts the Hono API on 8787, imports Module 1 once,
and starts the React editor plus isolated Preact preview on 5175.
Existing drafts are retained. Ctrl+C stops the development servers.
No Cloudflare login, remote database or deployment is required.

- Add providers and source courses.
- Add modules, pages and content blocks; reorder blocks while preserving stable IDs/icons.
- Add narration mappings/scripts even to previously unmapped pages.
- Preview Self Paced/Guided at phone, tablet and desktop sizes.
- Create a Spanish/Nicaragua edition (es / NI), or another explicit language/region.
- Initiate AI translation per page or for remaining untranslated pages.
- Compare source/translation, edit it, keep reviewer notes and mark local review.
- Export draft JSON for review.

Source wording is protected behind an explicit draft-editing unlock. Translation
never changes the English source or automatically approves/publishes content.
New scripts use browser voice until approved recordings are explicitly attached.
Translation does not generate new Opus files.

## OpenAI translation configuration

Use **Translation settings** to submit a key through a masked, write-only field.
The local Worker holds it in memory for at most 12 hours or until restart.
Keys are not saved in browser storage, D1 or exports. Reopening settings shows no key.
Do not paste a key into course content or send it in chat.

For persistence across local restarts, the user may configure OPENAI_API_KEY in the
ignored services/api-worker/.dev.vars.local file. OPENAI_TRANSLATION_MODEL is optional;
the default is gpt-5-mini. A real API request occurs only after an explicit generation
action and uses the user's OpenAI account. Automated tests stub paid calls.

See the [complete authoring/translation runbook](docs/10-PROVIDERS-AUTHORING-TRANSLATION.md)
for review rules, source-change handling and current limits.

## Persistence and repository layout

Local D1 lives in services/api-worker/.wrangler/state/ and is ignored by Git.
Keep it to keep drafts. Git tracks schema/migrations/source, not local databases.
A pre-upgrade copy was saved under ignored .wrangler/backups/.
Repeated import never replaces an existing module or its drafts.

- newvines-learning/: existing learner app, own package/lockfile/build.
- apps/cms-web/: React authoring UI.
- apps/cms-preview/: Preact preview host, no learner app imports/storage/service worker.
- packages/content-model/: shared Zod contracts and a type-only learner entry.
- packages/content-runtime/: shared Preact presentation, templates, narration and styles.
- services/api-worker/: local Hono API.
- database/content/: Drizzle schema/migrations.
- tooling/: local launcher and bootstrap importer.

Root installation supplies shared workspace dependencies. The Learning application
remains independently built/deployed with npm.cmd run build from its existing folder.
Its version/update UI, offline shell, storage and course loading stay app-owned.

## Validation

```powershell
npm.cmd run test:cms
npm.cmd run build:cms
```

Learning checks (from newvines-learning):

```powershell
npm.cmd run build
npm.cmd run test:offline
npm.cmd run test:updates
```

After schema changes, generate/review a migration and apply it locally:

```powershell
npm.cmd run db:generate --workspace @novoapps/api-worker
npm.cmd run cms:migrate
```

Review generated SQL. Migration 0002 uses an explicit SQLite JSON expression for
module-number uniqueness; Drizzle's expression-index serializer required correction.
The legacy Drizzle loader's nested esbuild is pinned to 0.25.12 to avoid its old
development-server advisory. Dependency audit and schema generation are checked.

## Before shared or hosted use

The API opt-in and loopback/origin checks are a local restriction, not authentication.
No hosted reviewer account, content approval or publication pipeline is configured.
The Nicaraguan reviewer will need the next authenticated-access milestone for remote
collaboration. platform-web and central identity must remain separate from CMS editing.

Provider assets, authenticated history/review, approved Scripture workflow, controlled
audio generation, translations beyond the pilot and versioned R2 publication follow
incrementally. Draft exports may include untranslated/unreviewed text and must not be
treated as approved packages.

CMS media and publishing: see [docs/11](docs/11-CMS-EDITING-MEDIA-PUBLISHING.md) for microphone/AI narration, images, page management, and the configured public R2 package destination.

PowerPoint curriculum import: [docs/13](docs/13-POWERPOINT-COURSE-IMPORT.md) documents the reusable source-preserving tooling and the six new local English Foundations module drafts.
