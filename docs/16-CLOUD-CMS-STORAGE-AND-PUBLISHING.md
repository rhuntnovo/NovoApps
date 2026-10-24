# Cloud CMS Storage and Publishing Preparation

Date: 2026-10-23 (verification completed 2026-10-24 UTC). Status: step 3 implemented.
The CMS remains local. No hosted CMS/API was deployed; the public v0.8.4 Learning
PWA and its approved English/Spanish content are unchanged.

## Resources and Data Boundary

| Resource | Purpose | Cloud Identifier |
| --- | --- | --- |
| `nvi-control-staging` | Private account/permission staging copy | `0e5304b1-6920-4503-b9e9-9920c51c5158` |
| `nvi-content-staging` | Private curriculum/revision staging copy | `08a9976f-4aa8-4818-8a0c-d65907654550` |
| `novoapps-drafts` | Private images, narration and media conversion tools | R2 bucket; public development URL disabled, no custom domains |
| `novoapps-content` | Existing approved public releases | Existing bucket retained; no public writes during this milestone |

D1 and R2 use Eastern North America location hints; these are placement hints,
not a legal residency guarantee. These are D1 databases, not Durable Objects.
No user backup bucket was changed. Cloud resource identifiers are configuration,
not credentials. `wrangler.jsonc` records bindings; staging has
`LOCAL_AUTHORING=false`, no hosted origins, and retains the API's loopback denial.

The user explicitly approved copying private draft curriculum, media, account
emails, password hashes and permissions. Live sessions, verification tokens,
publication leases and API keys were excluded. Existing account IDs, grants,
curriculum wording, Scripture, stable IDs and revision history were preserved.
This is a **point-in-time staging copy**, not synchronization or the active
authoring source. Subsequent local edits are not automatically copied to cloud.

## Try the Storage Backend Locally

Save pending edits and stop the existing launcher with Ctrl+C. From the repository root:

```powershell
cd C:\Development\NovoApps
npm.cmd run dev:cms:storage
```

Open http://127.0.0.1:5176/ and sign in with the same account credentials, then
open Content Studio at http://127.0.0.1:5174/. The header/banner says **Storage
Sandbox**. Use 127.0.0.1 consistently. Ports 5174/5175/5176/8787 must be free.

- Daily `dev:cms:auth`: primary local D1 plus native filesystem media helper.
- `dev:cms:storage`: separate local D1/R2 emulator state under
  `services/api-worker/.wrangler/state/storage-sandbox/`; no native media helper.
- First initialization makes/verifies a backup, copies primary D1 without sessions,
  and seeds private media/tools. Later starts retain sandbox edits and skip unchanged
  media. A marker records its source backup; incomplete preexisting state is refused.
- Sandbox Publish writes only to emulated local R2, even though destination labels
  use the real bucket names. This does not activate public course content. Published
  URLs retain the configured public origin and are not a local release browser.
- Sandbox edits, invitations and accounts do not update the daily CMS or cloud.
  This copy is not automatically refreshed. Do not use it for irreplaceable authoring.
- Stop it and run `npm.cmd run dev:cms:auth` to return to the daily dataset.

The launcher creates ignored `.dev.vars.storage` with a separate authentication
secret; it never copies an API key. Users enter AI settings again if needed.
Keep generated configuration private. A lost auth secret requires fresh sign-in,
not deletion of accounts or curriculum.

## Media and Publication Design

R2 mode removes the Node filesystem/Sharp/FFmpeg subprocess dependency from hosted
request paths. Existing daily local mode retains that helper. Owners prepare images
with browser Canvas (768/384 pixel variants), and manually recorded WebM/MP4 audio
with a single-thread FFmpeg Web Worker (mono Ogg/Opus). Marin-generated Opus is
stored directly. The API checks encoded dimensions/format, size, ownership and
permissions; immutable media paths use provider UUID, primary-course UUID,
language/locale, page/block and UUIDv7 asset names. Drafts remain private.

The pinned FFmpeg core is fetched on demand through owner-only authenticated R2
routes, about 31 MB on first recording conversion; it remains loaded during the
session and is released after inactivity. It is absent from learner bundles and
CMS static assets. First-use conversion needs connectivity; long recordings are
bounded to ten minutes. This does not make the CMS an offline editor. See the
CMS third-party notices for the core license and upstream source links.

Private reads stream through API authorization, use no-store and support byte
ranges. Reviewers can read media referenced by their allowed modules but cannot
upload, access tools, change destinations, generate paid media or publish.

Publication retains explicit saved/reviewed source checks and actor attribution.
The Worker acquires a 15-minute D1 lease, verifies all referenced private objects,
copies exact bytes into an immutable provider/course/locale/module release, writes
course JSON and checksums, rechecks revisions and conditionally replaces
`latest.json` **last**. Competing invocations and failed uploads leave the previous
pointer active. Crawler exclusions remain at the public bucket root. R2 publishing
still does not deploy or update the learner's bundled offline catalog.

D1/R2 are not one transaction. A crash can leave unreferenced private/public
objects or a preparing audit record. If bookkeeping/lease cleanup fails after
activation, the response reports `auditPending`; a complete live release remains
active. Reconciliation, orphan retention/cleanup and operational monitoring are
required before production. No automatic deletion or reconciliation job exists.

## Migration and Recovery Evidence

The approved cloud copy used verified backup
`cms-backup-20261024T013643Z-661e93d3.zip` (SHA-256
`d86b6922c54ddea4be55597c40cb8be7ffaa6f1a1c1ffa1eae1629da6c1f6d00`).
Its private manifest, SQL and verification exports are ignored under
`services/api-worker/.wrangler/cloud-imports/step3-20261024/`.

`cms:cloud:prepare` extracts a verified archive, selects only primary `state/v3/d1/`
snapshots, applies additive migrations to copies, preserves IDs/text and removes
ephemeral rows. It fingerprints all table contents and rehearses restoration.
`cms:cloud:d1` refuses nonempty targets, imports the fixed staging databases only,
exports them again and compares every row fingerprint plus foreign keys. It does
not merge data or overwrite an existing cloud database. `--remote` is explicit.
`cms-private-assets.mjs` uses only `novoapps-drafts`; remote use requires an explicit
verified manifest. All 43 cloud objects were read back and SHA-256 matched.
No public bucket content was uploaded during validation.

Do not rerun import as a refresh: the targets are now populated. Before hosted
cutover, freeze authoring, make new backups, compare post-snapshot changes and
plan a verified refresh/merge into preserved targets. Existing staging content
must never silently replace newer local work.

`cms:backup` includes daily and nested sandbox D1/R2 state; it does not export
remote resources. Keep verified source ZIP/manifests and cloud exports/media
backups in private storage, with credentials managed separately. No remote
backup schedule or disaster-recovery guarantee is introduced here.

## Validation and Next Milestone

All 60 automated CMS/API/media/backup/cloud-import tests and CMS builds pass. Disposable
real local Wrangler D1/R2 plus Chrome exercised WebP preparation, actual WebM/Opus
and MP4/AAC conversion, protected byte-range playback, Worker publication and
existing invitation/session/reviewer flows. All paid AI calls were stubbed.
Cloud D1 round trips and all private-object checksums passed. No physical Safari
or Android device conversion/session test has been performed for this backend.

Before hosted reviewer access: email verification/invitation delivery and account
recovery, hosted credential policy, HTTPS/Secure cookies/exact origins, distributed
abuse limits, provider author/publisher roles, audit/reconciliation and remote
backup/cutover plans. Benchmark real devices and Worker CPU/subrequest budgets;
large module publication may exceed free-plan limits. No paid plan was enabled.
Deploy protected staging only after those decisions and checks; keep public
learner delivery independent.

References: [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[Worker limits](https://developers.cloudflare.com/workers/platform/limits/),
[FFmpeg WASM architecture](https://ffmpegwasm.netlify.app/docs/overview/).

The final local recovery archive is
`cms-backup-20261024T021451Z-ec0694fc.zip` in the ignored backup directory:
14 verified SQLite snapshots, 228 files, including both datasets and sandbox R2
blobs. Every archived file passed read-back SHA-256 verification.


## Startup Troubleshooting

The launcher reserves the editor port throughout initialization, then hands it to
Vite only once the API is ready. A second launch fails before database commands
run. Start only one CMS launcher at a time; an agent-started instance also counts.
If the CMS is already running, open its sign-in URL rather than starting it again.

Setup now names the failing operation (for example, applying CONTROL_DB migrations)
and preserves stderr diagnostics even for JSON-producing commands. A generic
Wrangler internal error occurred when two setup commands started concurrently;
it did not require resetting either database. Never delete sandbox/daily state as
a first response. `npm.cmd run test:cms-launcher` exercises real port contention,
release and subprocess error reporting without touching CMS data.


The [AI credentials/activity milestone](17-SUPER-ADMIN-AI-AND-ACTIVITY.md) now adds
encrypted provider settings, scoped generation and usage/reconciliation tables to
control D1. It has not been copied to remote staging. Cloud-copy preparation
preserves activity but excludes current credential ciphertext/nonce/key-version
and credential reference; configure credentials separately after a future import.
The staged snapshot remains dated and must not overwrite newer local authoring.
