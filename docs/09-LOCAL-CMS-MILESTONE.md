# Local Content Studio milestone

Date: 2026-10-20. Status: working local pilot; not deployed.
Learning's deployed baseline remains v0.8.3.

## Scope agreed for this milestone

The user chose **Local CMS and preview first**, followed by registration/authenticated
multi-user access before online deployment. See ADR 0008.

- React + TypeScript + Vite content editor on http://127.0.0.1:5174/.
- Hono Worker API with Wrangler local D1 on http://127.0.0.1:8787/.
- Separate Preact preview iframe on http://127.0.0.1:5175/.
- Drizzle schema/migrations for the content database.
- Shared Zod validation of the existing schema 0.3 delivery format.
- Import existing Module 1 without rewriting words, Scripture, IDs, or asset references.
- Page selection, layout/block order editing, individual/group reflections, and narration script editing.
- Explicit wording unlock; changed wording is draft content requiring review.
- Revision-based saves and conflict rejection.
- Draft JSON export for review; no publication to the deployed Learning app.

## Database model

`cms_courses` stores course identity, locale, and retained root metadata.
`cms_modules` stores module identity/metadata, an immutable imported source document,
and its SHA-256. Course/module IDs and existing published page/block IDs remain unchanged.

`cms_pages` assigns stable authoring UUIDv7 IDs and page order.
`cms_page_revisions` stores append-only page aggregates with their ordered canonical
block IDs, presentation metadata, optional activities/narration, revision number,
wording-review flag, and timestamp. Revision 1 preserves the import.

This is deliberately a page-level authoring/versioning unit. Blocks remain addressable
by stable IDs inside the aggregate; per-block relational editing and translation tables
are not yet implemented. The model is not the final approval/translation/publishing schema.

Saves check an expected revision and insert the next revision. A unique (page_id, revision)
constraint makes concurrent saves from the same revision mutually exclusive. A stale save
gets HTTP 409 and does not overwrite data. The UI retains unsaved edits on failure.

Published JSON is an export/delivery format. Local D1 revisions are the editable draft
source; the immutable imported snapshot is the reference, not a mutable published file.
New authoring IDs use UUIDv7; existing human-readable delivery IDs are not migrated.

## Preview boundary

The preview app imports the existing CourseViewer and CSS from Learning, through a
deduplicated Preact runtime. It does not import Learning/main.tsx or register a service worker.
React administration styles and the learner's styles are isolated in separate documents.
The deployed Learning app source/package/build workflow is unchanged.

Preview messages are accepted only from the configured CMS origin and parent window,
then validated with the shared course schema. Media paths are constrained. Local images,
icons, and existing Opus recordings are served read-only from Learning's public files;
production preview builds copy only those media folders, not its service worker or course JSON.

Unsaved valid edits preview automatically. Incomplete fields keep the last valid preview.
A page or mode change resets the preview so the lesson sequence can be reviewed from its start.
Changing narration text leaves its existing Opus recording unchanged until an explicit
future generation/review step. The preview still offers the existing explicit browser voice.

## Local access and persistence

The API requires LOCAL_AUTHORING=true and a loopback hostname, and accepts browser requests
only from CMS_ORIGIN. This is a local development restriction, not production authentication.
There is no production database binding, registration UI, user/session table, or content-role
authorization in this milestone. There is no deployment script for the CMS.

The placeholder D1 ID is for Wrangler local persistence only; it is not a provisioned cloud database.
`npm run dev:cms` migrates local D1, starts the API, imports once, and starts the two web apps.
Use 127.0.0.1 consistently because origin checks are intentional. No email provider is needed.

State persists in services/api-worker/.wrangler/state and is ignored by Git.
Do not commit local databases or .dev.vars files. No API/encryption keys are required.
The launcher never resets a database and duplicate import never replaces a draft.

## Validation

- 12 contract/API tests passed, including exact JSON-value round-trip, unknown metadata
  preservation, ID/reference validation, unsafe asset paths, failed/stale/concurrent saves,
  protected wording, and production/untrusted-origin denial.
- TypeScript checks and both production builds passed.
- Migration generation is repeatable and reports no changes after generation.
- An actual Wrangler local D1 migration/import populated all 20 pages.
- Browser checks rendered every page using the original viewer, verified section reveals,
  Scripture icons, illustrations, step bullets, the single closing prayer, and actual Opus playback.
- An editor reflection save survived browser reload; the test change was restored and
  D1 draft export again matched the original published module.
- Editor layouts were checked at phone, tablet-width, and desktop widths.
- The deployed Learning source has no changes.
- Dependency audit is clear with the documented esbuild tooling override.

## Next milestone

Implement central identity using Better Auth and a separate nvi-control D1 database,
then enforce content permissions and record the authenticated editor on revisions.
Validate session behavior, invitations, and recovery before accepting public traffic.
Do not implement separate per-workspace identity databases.

After that: review/approval, asset management, translations and localization tracking,
versioned R2 course packages, catalog/download metadata, and controlled Learning publication.
SQLite-backed Durable Objects remain the preferred future workspace operational store;
they are not needed to run this content-authoring pilot.
