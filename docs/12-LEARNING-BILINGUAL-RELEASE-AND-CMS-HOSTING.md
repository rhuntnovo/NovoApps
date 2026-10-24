
# Learning v0.8.4 bilingual release and CMS hosting readiness

Date: 2026-10-23. The user authorized publishing the viewer with English and Spanish
and explicitly approved the final Spanish page 18. It was already marked reviewed
by the time publication ran. No curriculum text was rewritten.

## Published viewer

Worker: novoapps-newvines
URL: https://novoapps-newvines.rhuntnovo.workers.dev
App version: 0.8.4
Worker version: 55de6a5b-982d-405d-8f82-96d6228b571a
Offline release: e4bbc8d1aadee94e6d9c
Previous Worker version (v0.8.3): b9591d53-a87b-47ce-8969-5ca91214d405

English and Spanish/Nicaragua Module 1 each have 20 pages. A compact Language / Idioma
selector sits beside the version. Selection persists locally and in the URL;
?lang=en and ?lang=es-ni are supported entry links. Switching editions keeps a matching
canonical page and Guided mode. HTML language metadata follows the selected locale.

The host supplies appVersion independently of the published course's legacy
presentation_version. The update handoff is now scoped by provider, course, module,
country and language; the original English Module 1 handoff is accepted for the
first v0.8.3-to-v0.8.4 update. Existing update/save callbacks remain in the learner app.

## Approved publication snapshots

Both module packages were published through the local CMS API after its revision
and translation-review checks. The provider/course/language folders are:

new-vines/FGMM-01a15c09-1e35-726f-a49c-b0411bdbf53c/en-global/modules/FGMM-M01/
new-vines/FGMM-01a15c09-1e35-726f-a49c-b0411bdbf53c/es-ni/modules/FGMM-M01/

Public R2 base: https://pub-99c5b6d16ed64e6283483cda548e55f5.r2.dev
English release: 2046e1ec-686e-475c-9f88-bd1d1b450a91
Spanish release: 228d4fc3-abdf-46cf-8023-c206b55009d2

Each folder has releases/{release-ID}/course.json, manifest.json and immutable
media, plus latest.json. Bucket-root robots.txt was uploaded before course objects.

tooling/stage-learning-publications.ts verifies all manifest SHA-256 hashes and
publication identities before exposing a new viewer catalog. Published course/media
bytes are copied unchanged into newvines-learning/public/delivery/{provider}/{course}/{locale}/{module}/{release}.
public/courses/catalog.json selects the active snapshots and maps original media paths to compact content-hash filenames. The learner host resolves
those references against the same-origin bundled folder for offline use. Delivery manifests retain source paths, full hashes and source-publication provenance. The original
canonical JSON remains untouched. A failed download/checksum leaves the previous
catalog active. Earlier module packages remain in R2 for controlled recovery.

The build validates all 58 immutable package files and both edition identities.
The service worker caches both course documents/catalog with the shell; audio/images
remain optional media. The release contains 16 required files and 89 optional media,
about 4.92 MB total. No Zod/React/CMS helper dependencies were added to the learner bundle.

## Updating content in this increment

CMS Publish uploads an approved module package to R2. It does NOT automatically
activate it in already installed viewers. This increment deliberately delivers an
explicit frozen catalog with the app release, preserving the proven atomic offline
update behavior. A future independent package catalog/download manager is separate work.

For the current workflow:
1. Review and publish each changed module/edition in the local CMS.
2. Save the returned url and manifestUrl values into a local JSON array.
3. From the repository root run npm.cmd run stage:learning -- <publication-results.json>.
4. In newvines-learning run npm.cmd run build and appropriate tests, then deploy with Wrangler.
5. Existing installed clients use the online Update button to activate the complete release.

The local publication result array for this release is in the ignored
newvines-learning/.wrangler/publication-results.json. It contains public URLs/IDs only.
New publications do not automatically translate, approve, regenerate narration, or
replace the canonical source. Spanish pages use their configured browser/recorded
narration; this release generated no new AI output.

## CMS and D1 hosting needs more work

CMS and authoring D1 remain LOCAL. No remote authoring/control database or hosted CMS
was provisioned/deployed in this release. Current API rejects non-loopback hosts and
requires LOCAL_AUTHORING. This must not be removed as a substitute for authentication.

Root AGENTS.md requires validated identity/provider permissions before hosted authoring.
ADR 0004 accepts separate nvi-control and nvi-content D1 databases; ADR 0003 proposes
Better Auth pending validation. A public course viewer needs neither a live CMS nor
a D1 connection for delivery.

Before a hosted reviewer/editor pilot:
- Implement validated sign-in/session behavior and provider-scoped author/reviewer/publisher
  permissions; check them on every API operation and preview/content access.
- Attribute changes/reviews/publications to authenticated users and preserve concurrency,
  revision history and source-version review checks.
- Provision private nvi-control/nvi-content D1 bindings, apply migrations and verify a
  controlled backup/import of local authoring data without replacing local drafts.
- Store draft/original media privately; expose only explicitly approved publications.
  Replace local filesystem/Wrangler subprocess publishing with server-side R2 bindings.
- Replace or host the Node FFmpeg/Sharp helper appropriately: native executables and
  filesystem storage cannot simply be moved into the current Worker. Confirm Safari
  recording conversion and image processing paths before promising equivalent features.
- Replace the shared in-memory development key with per-user/provider credential
  handling and an approved secure secret-storage policy. Never expose keys in read APIs,
  D1 curriculum records, browser persistence, public packages or logs.
- Validate authenticated preview origins/CORS/CSRF, invitations, review access, recovery,
  quotas and production failure handling. Crawler exclusions are not access controls.

Recommended next milestone: an authenticated CMS/D1/R2 pilot for the owner and Spanish
reviewer. Keep the public viewer independent and working offline throughout this work.

## Validation

- 28 CMS/model/API tests plus the native media integration test pass.
- Three publication staging/hash/isolation tests and four catalog/identity tests pass.
- Fifteen offline and eleven update regression tests pass (62 automated tests total).
- CMS/preview builds and learner build pass; published package hash validation passes.
- Chrome checked English/Spanish rendering, 320/390/768/1440px widths, existing Opus playback,
  offline byte ranges, persisted selection, offline language switching and Spanish page 18's
  new illustration.
- A real live v0.8.3 Update button upgraded to v0.8.4 while preserving page/Guided mode.
  Live offline Spanish cold reopening measured 102 ms on the desktop test machine;
  this is not a physical iPhone/Android performance guarantee.
- No paid AI call or source-control commit/push was made. Public R2 package publication
  and viewer Worker deployment were explicitly authorized cloud changes.

Final Windows/Git verification: generated media paths are content-addressed and at most 202 characters including the current workspace root. Source course/media bytes remain identical to approved R2 publications. Both the original v0.8.3 upgrade and the compact-path v0.8.4 update were exercised. All 106 final deployed files and their noindex headers were compared with dist. No Git long-path setting or OS configuration was changed.

Local hosting-prerequisite update (2026-10-23): invite-only Better Auth/control D1,
course/locale reviewer permissions and authenticated revision attribution are now
implemented and locally validated; see docs/15 and ADR 0013. This does not deploy
the CMS or remove the remaining cloud media, email/recovery, secrets and hosting work.
