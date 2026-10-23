# NovoApps --- Decisions and Roadmap

## Strongly settled

-   Develop outside OneDrive at `C:\Development\NovoApps`; Git/GitHub is
    source history.
-   Node/npm + VS Code; lightweight Preact/TypeScript/Vite PWAs.
-   Learning has one canonical record; Self Paced/Guided are
    presentation modes.
-   Protect canonical curriculum.
-   Marin Opus selected for production Guided narration; browser TTS
    is an explicit learner option.
-   CMS authoring source → published JSON/assets delivery.
-   `workspace` is universal data partition.
-   IndexedDB for offline structured operational data; Cache Storage for
    static/large course media.
-   UUIDv7 for new synchronized record IDs; server sync sequence
    separate.
-   tombstones/version metadata for sync.
-   client-side encrypted sensitive payload + minimal clear envelope.
-   residency remains relevant.
-   public educational content and private operational/user data are
    separate storage classes.
-   Inventory remains simple last-cost microbusiness workflow; JSON Gzip
    restore + Excel human export; offline + EN/ES.

## Open decisions

Current platform direction is NEW_VINES_PLATFORM_ARCHITECTURE.md and ADR 0001–0008.
Separate D1 control/content databases are accepted. Better Auth and one SQLite-backed
Durable Object per operational workspace are preferred proposals pending validation.
Hono, Drizzle and Zod are used in the local CMS. Earlier Supabase-first notes are
background alternatives; keep API/storage boundaries clear.

Encryption/key recovery still needs deliberate design: workspace keys,
per-user/device wrapping, trusted-device/member transfer, recovery
secret/threshold option, lost-device recovery. Account recovery is
distinct.

Conflict resolution can start simple where acceptable but preserve
metadata for improvement.

The initial local D1 authoring schema is implemented; fuller CMS SQL follows
authoring workflows.

Before country rollout, determine residency/transfer law, provider
regions, encrypted-ciphertext treatment, workspace region/provider
pinning, retention/export/deletion.

## Recommended sequence

1.  **Learning delivery:** keep deployed v0.8.3 stable; maintain tested
    install/update/offline; formalize JSON schema, IDs, content/schema
    versions, catalog; finish Guided UI issues.
2.  **CMS:** course/module/page/block editor; preview;
    Guided/facilitator; assets; localization;
    validation/approval/publication; controlled narration generation.
3.  **Shared platform:** auth; workspaces/roles; IndexedDB; UUIDv7;
    sync/tombstones; encryption/key prototype; provider-neutral Sync
    API; residency routing.
4.  **Inventory:** inspect old source; reproduce
    purchase/sale/last-cost; move to shared foundation; preserve
    backup/export; offline validation.
5.  **Finance:** accounts/categories; transactions; budgets;
    budget-vs-actual; ledger; multi-user; optional Inventory linkage.

## Documentation rule

When an architectural decision changes, update the relevant `docs/` file
and `AGENTS.md` if it affects future coding behavior. Prefer
documentation changes in the same Git commit as the architecture change.

## Learning v0.8.2 release (October 19, 2026)

Released to Cloudflare Worker novoapps-newvines. Self Paced and Guided now share
one section viewer throughout Module 1, with the title cover and single-block
closing prayer preserved. Group/individual questions are independent of narration;
Self Paced and Present support a group leader advancing sections on a projector.
The compact phone dock, viewport-safe reflections, subtle green active borders,
Scripture borders, icons, and bulleted step examples are included.

Stable block IDs and schema 0.3 map the unchanged narration to the existing 15 Opus
recordings on P005--P008. Recorded audio remains the default; errors show Retry and
browser TTS requires an explicit choice. The user confirmed desktop Chrome plays
the recordings; their VS Code embedded browser does not. No audio was regenerated.

Nine Kenya-audience illustrations have responsive WebP variants, localized-image
metadata, provenance, and optional offline caching. Canonical curriculum wording
is unchanged. The CMS audio setting, write-only API credential design, and upload/
generation workflow are documented for future authoring implementation.

Package/display version is 0.8.2; schema version is independently 0.3. The build
passed course validation and TypeScript/Vite. All 44 deployed files matched the
local build by SHA-256. Previous local browser checks covered layouts, reveals,
reflections, real recording playback, failure handling, and offline content/media.
Next priorities remain physical Android install/update/offline validation, catalog
and publication design, followed by the planned CMS and shared platform sequence.

## Offline launch follow-up (v0.8.3, October 20, 2026)

Prioritize the iPhone airplane-mode startup correction before further feature work.
The released Learning fix uses a complete build-generated precache and immediate saved
shell delivery, with background update checks and bounded missing-file requests.
It preserves the prior release on failed core downloads and supports cached media
byte ranges. See docs/01 and the Learning README for behavior and verification.
Verify the published correction on the physical iPhone and Samsung tablet; the
currently deployed baseline is v0.8.3. No curriculum or audio regeneration
is required for this correction.

## User-controlled Learning updates (v0.8.3)

The offline-startup correction also includes a compact Update action beside the
version, periodic/foreground checks for long-running sessions, and save-before-reload
hooks. Ready updates wait for a tap. Learning preserves a one-time session handoff;
future record-entry screens must flush local transactions before update activation
and block further edits while saving. Cloud sync remains independent. Browser update,
failed-save retry, phone layout, and offline state restoration were verified locally.
Published together as v0.8.3; repeat physical iPhone/Samsung testing.

## v0.8.3 publication verification (October 20, 2026)

Published to novoapps-newvines, Cloudflare version
b9591d53-a87b-47ce-8969-5ca91214d405. Package/display is 0.8.3; schema stays 0.3.
Build and 26 regression checks passed; all 44 live files matched dist by SHA-256.
Live Chrome confirmed v0.8.3, complete offline installation, immediate cached startup
under offline/stalled connectivity, and real recorded Opus playback offline.
Keep physical iPhone and Samsung installation/update/offline tests as the next check.

## Local CMS milestone and device verification (October 20, 2026)

The user confirmed that v0.8.3 updated smoothly online and then opened quickly after
closing/reopening in airplane mode on both iOS and Android. This completes the requested
device startup/update check; it is not a claim that every device/media/recovery case is tested.

The user selected local CMS and preview first, with registration/authenticated access
before hosted deployment (ADR 0011). A working React editor, Hono/local D1 service,
Drizzle migrations and separate Preact runtime preview are now available. Module 1
imports/exports with every existing JSON value preserved. Draft revisions, explicit
wording-review changes, conflict rejection, responsive preview, original media/icons,
and save/reload persistence were checked. See docs/09 and the root README.

Next: validate Better Auth against a separate control D1, add authenticated editor
identity/content permissions and audit attribution, then implement controlled review,
approval, R2 assets and immutable publishing. Do not expose the local authoring bypass.
Keep workspace Durable Objects, Finance/Inventory sync and private-data crypto/recovery
as later platform work. No remote CMS database or public CMS was provisioned/deployed.

## Provider authoring and Spanish review update (2026-10-21)

The user's next priority is authoring the remaining English Foundations modules,
explicit AI translation to Spanish/Nicaragua, and human comparison/editing/review.
The local implementation is in docs/10 and ADR 0012. Module/page/block/narration
creation, provider-scoped editions, write-only translation settings, source revision
tracking and shared content-runtime are implemented. No cloud publication or hosted
reviewer access was added. The earlier direct Learning-source preview shortcut is
superseded; historical pilot ADR 0008 has been renumbered 0011.

Before remote reviewer access: implement platform-web, validated identity/control D1,
provider permissions and audit attribution. Then controlled approval/assets/audio and
immutable publication/catalog support. Existing v0.8.3 publication remains unchanged.