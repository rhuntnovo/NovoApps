# NovoApps Architecture Documentation

These files preserve agreed design context so VS Code/Codex sessions do
not depend on conversational memory.

-   `01-CURRENT-LEARNING-CODEBASE.md` --- New Vines Learning v0.8.4.
-   `02-LEARNING-CMS-ARCHITECTURE.md` --- authoring/publishing CMS.
-   `03-NOVOAPPS-PLATFORM-ARCHITECTURE.md` --- shared multi-app
    platform.
-   `04-OFFLINE-DATA-SYNC-ENCRYPTION.md` --- IndexedDB, IDs, sync,
    encryption, recovery/residency.
-   `05-BACKEND-DECISIONS-D1-VS-SUPABASE.md` --- backend tradeoffs.
-   `06-INVENTORY-APP-RECREATION-SPEC.md` --- prior Inventory PWA and
    recreation target.
-   `07-FINANCE-APP-SPEC.md` --- planned Finance app.
-   `08-DECISIONS-ROADMAP.md` --- settled/open decisions and sequence.

`../AGENTS.md` is the operational instruction file AI coding agents
should read first.

Update these documents when an architectural decision changes; they
describe the current agreed design, not just history.

Current platform direction: [NEW_VINES_PLATFORM_ARCHITECTURE.md](NEW_VINES_PLATFORM_ARCHITECTURE.md).
Read [the ADRs](ADR/) for accepted decisions and proposals; ADR statuses are meaningful.
The new target and accepted ADRs supersede earlier Supabase-first guidance in docs 03/05/08.
[09-LOCAL-CMS-MILESTONE.md](09-LOCAL-CMS-MILESTONE.md) describes the working local CMS,
its scope/access boundary, and what remains before hosted authoring.

Current application/provider boundaries: [ARCHITECTURE.md](ARCHITECTURE.md),
[APPLICATION_BOUNDARIES.md](APPLICATION_BOUNDARIES.md),
[REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md), and
[CONTENT_PROVIDER_MODEL.md](CONTENT_PROVIDER_MODEL.md).
[10-PROVIDERS-AUTHORING-TRANSLATION.md](10-PROVIDERS-AUTHORING-TRANSLATION.md)
describes new authoring and Spanish/Nicaragua review controls. Historical local-pilot
ADR 0008 is now uniquely numbered 0011; the monorepo decision retains 0008.
[11-CMS-EDITING-MEDIA-PUBLISHING.md](11-CMS-EDITING-MEDIA-PUBLISHING.md) covers current editor feedback, microphone/AI narration, images, page order/deletion and local R2 publication.

[12-LEARNING-BILINGUAL-RELEASE-AND-CMS-HOSTING.md](12-LEARNING-BILINGUAL-RELEASE-AND-CMS-HOSTING.md) records the published v0.8.4 English/Spanish viewer, immutable offline staging, and requirements before hosted CMS/D1.

[13-POWERPOINT-COURSE-IMPORT.md](13-POWERPOINT-COURSE-IMPORT.md) describes the reusable source-preserving PowerPoint workflow, local Foundations Modules 2-7, source-review items, backups and validation.
