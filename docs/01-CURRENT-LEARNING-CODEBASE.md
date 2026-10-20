# New Vines Learning PWA ? Current Codebase

## Released baseline

Current deployed baseline: **v0.8.2** (October 19, 2026). Stack: Vite + Preact +
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
versions remain conceptually separate. Package/display version is currently 0.8.2,
schema is 0.3, and the service-worker cache is `novo-apps-shell-v0.8.2`.

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
public/sw.js
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
The production service worker caches shell/course content and optional media.
Missing optional media must not break installation. Vite development unregisters
service workers to avoid stale content. Hashed JS/CSS are currently cached at runtime;
first-install/update/offline lifecycle checks on physical Android devices remain important.

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
