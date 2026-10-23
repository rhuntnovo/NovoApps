# New Vines Learning PWA ? Current Codebase

## Released baseline

Current deployed baseline: **v0.8.4** (October 23, 2026). Stack: Vite + Preact +
TypeScript + PWA/offline support + Cloudflare Workers Static Assets.
Node/npm workflow. Worker: `novoapps-newvines`.

Canonical Module 1 file: `public/courses/nvi-fgmm-m01.en-global.json`.
Model: Course ? Module ? Page ? Content Blocks. The module has 20 pages:
a title cover and 19 teaching pages. Preserve canonical curriculum and Scripture;
the previously approved Step 5 numbering correction remains recorded in source issues.

## Shared Self Paced and Guided viewer

One `CourseViewer` and `LessonBlocks` render both modes from the same canonical
records. Self Paced reveals sections manually; Guided adds optional narration.
Both modes navigate all pages and preserve the current page/visible content when
switching. The module cover retains its title/logo template, and the closing prayer
on displayed page 20 (P017) remains one body block with its stanzas and attribution.

The existing compact dock advances Next section ? Reflect ? Next page, with narration
controls added in Guided. There is no second row of action buttons on phones.
The options menu contains Show entire page, Open reflection where available,
Group questions, a voice choice on narrated pages, and Present.
Keyboard arrows/Page Up/Page Down and horizontal swipes advance sections/pages.
The F key toggles Present. Ordinary content taps allow selection and scrolling.

Individual/group activity wording is independent of narration mode. Self Paced can
be led by a group leader using a projector. Present selects group questions and
preserves manual section advancement; Show entire page is a separate reading option.
Individual prompts are at `page.reflection`; existing group instructions remain at
`page.guided.facilitator`. Reflections use a native viewport-constrained modal dialog
with internal scrolling, accessible focus handling, and Escape dismissal.

Active normal blocks use the same subtle 6px rounded left border as Scripture,
colored green. Scripture retains permanent brown borders on both sides.
Bible, prayer, concept, examples, and step markers are preserved. Indented examples
on displayed pages 14/15 (P014A/P014B) render as bullets without changing source text.

## Narration

Existing pre-generated Marin Opus recordings cover P005?P008: 15 segment files.
Other pages remain manually navigable in either mode and indicate no recording.
Narration never starts automatically on entering a page.

The first already-visible block starts audio directly from the Narrate click.
Later blocks reveal approximately 500 ms before their narration; actual audio/TTS
completion advances the sequence. Pause, resume, replay, and cancellation on navigation
are supported. Playback reuses one audio element to retain phone playback permission.

Marin recording is the default. The viewer never substitutes browser speech
automatically after a recording failure. A blocked recording requests Resume;
other failures show Retry and a readable error. The learner may explicitly select
Use browser voice or Use Marin recording in lesson options. The footer identifies
Marin AI narration or browser voice. No learner API key is required or published.

The user confirmed Opus works in desktop Chrome and cannot play in their VS Code
embedded browser. Use Chrome for recording tests; the embedded preview can use the
explicit browser-voice option. Do not treat its media limitation as missing audio.

Generator: `scripts/generate-guided-audio.mjs`, command `npm run generate:guided-audio`.
It reads mapped segments and also understands the earlier parallel-array format.
Do not regenerate unless narration/audio changes. Never request, expose, or commit
the user's API key. Future CMS generation settings remain authoring-side only.

## Published schema and versioning

Schema `0.3` assigns stable human-readable ContentBlock IDs. Teaching pages set
`presentation.reveal_blocks`; title blocks use `type: "title"`.
`guided.segments` maps `block_id` to supplemental narration text and an audio URL.
The viewer follows canonical block order and resolves narration by ID, rather
than splitting paragraphs or aligning independent arrays at runtime.

Package/app version, displayed presentation version, schema, and asset/cache
versions remain conceptually separate. Package/display version is currently 0.8.3,
schema is 0.3, and the service-worker cache is content-derived: `novo-apps-shell-63f3e47ebc9bc3a6028f`.

## Responsive artwork

Nine supplemental Kenya-audience illustrations are attached to 11 canonical blocks:
needs/family meal, wants/soccer ball, setting money aside/emergency preparation,
helping a neighbour, a tangible bicycle goal, couple planning, school preparation,
writing goals, and ants gathering food. Shared scenes reuse asset URLs.
Existing icons remain alongside illustrations; canonical wording is unchanged.

`ContentBlock.image` holds `src`, optional `small_src`, localized `alt`, dimensions,
and `LOCALIZE_IMAGE` policy. WebP assets have 768px and 384px variants, approximately
691 KiB total for all 18 files. They sit beside text on larger screens and below
it on phones. Missing optional media leaves the lesson readable. The service worker
optionally caches the files. Exact prompts/provenance are in
`scripts/illustration-prompts.json`; the Learning README lists asset/block mappings.

## Important files

```text
src/App.tsx
src/components/CourseViewer.tsx
src/components/LessonBlocks.tsx
src/components/ReflectionDialog.tsx
src/components/templates/TemplateRenderer.tsx
src/hooks/useNarration.ts
src/styles.css
src/types.ts
src/types/course.ts
public/courses/nvi-fgmm-m01.en-global.json
public/assets/illustrations/
public/manifest.webmanifest
public/sw.js (build template)
scripts/build-service-worker.mjs
tests/service-worker.test.mjs
scripts/validate-course.mjs
scripts/generate-guided-audio.mjs
scripts/illustration-prompts.json
```

`src/types/course.ts` re-exports consolidated types from `src/types.ts`.
The separate `GuidedDemoViewer` has been removed.

## Build, offline, and deployment

`npm run validate:course` checks stable IDs, narration references, prompt metadata,
and audio/illustration availability. `npm run build` runs validation, TypeScript,
and Vite. `npm run preview` serves the built release locally.
Use `npm.cmd` where PowerShell blocks npm.ps1.

Cloudflare serves `dist/` with SPA fallback; courses are under `/courses/`.
The production service worker precaches a complete HTML/JS/CSS/course shell and
optional media from the generated build manifest. Saved content opens immediately;
updates download in the background and wait for the learner's Update action.
Missing optional media must not break installation. Vite development unregisters
service workers to avoid stale content. Physical iPhone/Samsung install/update/offline
lifecycle checks remain important. See the v0.8.3 details below.

## Validation and remaining refinements

Local browser checks covered all page reveals, preserved icons, phone/tablet/desktop
layouts, viewport-safe reflections, group/projector use, real Opus decoding/playback,
pause/resume/replay, explicit voice choice, failure handling, and offline content/media.
Canonical wording, narration scripts, and original audio references were compared
with the previous baseline. The v0.8.2 release build passed; all 44 published files were verified by SHA-256.

Remaining work includes physical Samsung/Android install/update/offline testing,
catalog/publication architecture, persistent learner state, external UI localization,
and data-driven module title metadata instead of hardcoding Module 1.
Update documentation alongside future architectural changes.

## Offline-startup correction (v0.8.3, October 20, 2026)

Physical iPhone airplane-mode testing exposed an unbounded network-first navigation
in the previously deployed v0.8.2 worker. Saved JS/CSS were also dependent on runtime caching.
The local fix serves the saved shell/code/course immediately, with update checks
separate from rendering. Production registration skips an explicitly offline browser
and retries on the online event. Downloaded updates now wait for a user action;
an active lesson is not automatically reloaded.

The build now generates dist/sw.js from public/sw.js using
scripts/build-service-worker.mjs. A content-derived cache revision includes every
published file and the worker template, independent of package/schema/content versions.
HTML, Vite hashed JS/CSS, course JSON, manifest, logo, and icons are required precache
files. Every required download must succeed before replacement; failure preserves
the previous worker/cache. Required downloads abort after 8 seconds. Optional media
attempts abort after 5 seconds and cannot prevent installation; later successful
full-media downloads can be saved. Partial (206) responses are never stored as full
recordings. Cached recordings support byte-range requests for mobile media players.

Public same-origin cache matches ignore Vary so CDN Vary: Origin does not hide saved
module/CORS assets. Core files stay together as a release rather than being individually
refreshed in the background. Missing files return immediately when explicitly offline,
otherwise fetch has a 3-second connection/response-header timeout. Activation deletes
only older novo-apps-shell- caches. Vite development still unregisters service workers;
use npm run build and npm run preview for offline validation.

npm run test:offline covers immediate cached startup with an unresponsive network,
complete offline shell access, CDN Vary matching, failed/stalled updates, optional
media failures/recovery, cache cleanup boundaries, fetch timeout, and audio ranges.
The build passes. A fresh Chrome production-preview installation saved all 43 content
files; offline and simulated 10-second-latency launches completed in about 0.1 seconds,
with HTML/JS/CSS/course all coming from Cache Storage. Actual cached Opus playback
also passed offline. Physical iPhone and Samsung testing of the fix is still needed.
This correction is published in v0.8.3 alongside the update notification below.

## Update notification (v0.8.3, October 20, 2026)

A compact Update button beside the displayed version appears when a new worker has
finished downloading. Updates wait rather than automatically calling skipWaiting.
The first installation activates normally without displaying an update notification.
Checks run on launch, connectivity return, focus/visibility return (foreground checks
limited to once per minute), and every 15 minutes while visible/online. Mobile
background timers may be suspended; resuming the app triggers a foreground check.
The app still opens from its cache without waiting for an update request.

Tapping Update awaits all appUpdates.beforeUpdate callbacks, then sends ACTIVATE_UPDATE
to the waiting worker, waits for controllerchange, and reloads. Repeated taps cannot
start duplicate updates. Failed saves or a 10-second activation timeout leave the app
open with retry guidance. A fully downloaded update can be applied offline. A different
window activating a worker shows Update in this window without forcing it to reload.

Learning currently has no editable operational records. Its beforeUpdate callback
writes a one-time, course/language-scoped sessionStorage handoff: page and block IDs,
revealed section, Self Paced/Guided, individual/group audience, presentation fallback,
reflection state, and voice choice. Missing page/block IDs fall back to available
content after a publication change. Narration stays stopped after reload. Native
fullscreen requires a fresh gesture; in-app presentation is preserved. This handoff
is not durable learner progress or cloud synchronization.

Future editable screens must register async local-write/transaction flush callbacks
and disable edits while saving/updating. Rejection must cancel activation/reload;
never claim that cloud synchronization is required to preserve committed local edits.

Important new files: src/pwa/updateManager.ts, src/pwa/updates.ts,
src/pwa/lessonResume.ts, src/components/UpdateNotice.tsx, tests/update-manager.test.mjs.
The build and 26 regression checks pass. A real two-release Chrome test verified
foreground detection, no forced reload, save failure/retry, and an offline update
that restored lesson state. Layouts were checked at 320, 390, 768, and 1440 pixels.
Physical iPhone/Samsung verification remains pending. Published as v0.8.3. Existing installed
clients must first receive this app update before they can display future update buttons.

## v0.8.3 release (October 20, 2026)

Package.json, root lockfile package entries, and displayed presentation_version are
now 0.8.3. The build passed, including the generated complete offline release; all
26 offline/update regression checks passed. Schema remains 0.3. The only change to
the canonical course JSON in this version bump is presentation_version; teaching,
Scripture, narration, IDs, and asset references are unchanged. This release includes
the offline-startup correction and user-controlled update notification described above.
Published to Cloudflare Worker novoapps-newvines at
https://novoapps-newvines.rhuntnovo.workers.dev.
Cloudflare version: b9591d53-a87b-47ce-8969-5ca91214d405.
Previous v0.8.2 Cloudflare version: 517f8d21-a134-464a-bfb2-6ae47e9c01e5.
Release cache revision: 63f3e47ebc9bc3a6028f.
All 44 published files matched dist by SHA-256. A fresh live Chrome installation
rendered v0.8.3 and saved 43 content files (the worker itself is not precached).
Offline startup completed in 67 ms and a simulated 10-second-latency launch in 54 ms
on the desktop test machine; HTML, JS, CSS, and course came from Cache Storage.
Actual recorded Opus playback and byte-range responses passed offline. These timings
are desktop measurements, not guarantees for low-end devices. Physical iPhone/Samsung
validation remains pending. Source, tests, and documentation form the v0.8.3 release commit.

Cloudflare supports rollback to a previous Worker deployment, including its static
assets. Installed PWAs receive the restored worker through a subsequent online
update check; offline devices retain their current saved copy until reconnecting.
The updater detects changed worker bytes rather than requiring a numerically
higher version. There is no per-device offline Undo action because old release
caches are deleted on activation. See the Learning README for recovery options and
Cloudflare documentation. No offline Undo feature was added and no rollback operation was performed.

## Device confirmation and separate CMS (October 20, 2026)

The user confirmed smooth online updating and fast airplane-mode cold reopening on
both iOS and Android for deployed v0.8.3. This is the requested device startup/update
validation noted as pending in the release history above. Additional device/media
and recovery cases can be tested independently.

A local CMS milestone now uses this app's existing CourseViewer/CSS in a separate
Preact iframe alongside a React editor; see docs/09. No Learning source/package,
service worker or published content was changed for that milestone. The CMS does not
publish drafts or require learners to query a content database.

## Shared-runtime source extraction (2026-10-21, not published)

Local source now consumes packages/content-runtime for Preact page presentation,
styles and narration, and content-model for erased content types. Course loading,
navigation state, updates, offline shell and session handoff remain app-owned.
Module 1 JSON and audio assets are unchanged. English/Spanish controls and authored
title rendering support CMS editions. The public release remains v0.8.3; no deployment
or version bump accompanied this local extraction. Root npm installation supplies the
shared packages. See docs/10 for the authoring/review milestone and its validation.
## v0.8.4 bilingual publication (October 23, 2026)

The deployed viewer now loads a provider/course/module/locale catalog of verified immutable R2 package snapshots. English and Spanish/Nicaragua Module 1 are bundled for offline selection. The host supplies app version 0.8.4 separately from content versions. Existing v0.8.3 online update and page/mode handoff were verified on the live Worker. See [docs/12](12-LEARNING-BILINGUAL-RELEASE-AND-CMS-HOSTING.md) for release IDs, staging workflow, validation and hosted CMS prerequisites. CMS and authoring D1 remain local.
