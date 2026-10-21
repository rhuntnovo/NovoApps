# New Vines Learning PWA v0.8.3

Published v0.8.3 (October 20, 2026): https://novoapps-newvines.rhuntnovo.workers.dev

Version 0.8.3 includes the offline-startup correction and the user-controlled Update
button described below. Package/lockfile and displayed presentation metadata are
0.8.3; the published schema remains 0.3. Curriculum and existing recordings are unchanged.
The release passed 26 regression checks, and all 44 published files matched the local
build by SHA-256. A live Chrome check confirmed the displayed version, immediate offline
startup, and recorded narration playback. Physical iPhone/Samsung verification remains.

Lightweight Preact + TypeScript + Vite PWA, published through Cloudflare Workers Static Assets.
Read `../AGENTS.md` and the architecture documents in `../docs/` before making changes.

## Shared lesson viewer

Self Paced and Guided use `CourseViewer` and the same canonical page records in
`public/courses/nvi-fgmm-m01.en-global.json`. All 19 teaching pages use the shared
section-by-section experience; the module cover retains its logo/title layout.

- Self Paced begins with one visible content block. The existing navigation dock advances
  to the next section, then opens a reflection, then advances to the next page.
- Guided uses the same content blocks and adds narration. Each audio/TTS completion
  reveals the next mapped block after the configured reveal lead. Narration starts only
  when the learner presses Narrate. Existing recordings cover P005–P008; other pages
  remain manually navigable in either mode and show that no recording is available.
- The dock remains one row of buttons on phones. The options menu (`•••`) contains
  Show entire page, Open reflection, Group questions, and Present. Present preserves
  section advancement; Show entire page is a separate reading option.
- The latest section gets a green rule wrapping its left corners. Scripture keeps
  permanent brown borders. Bible, prayer, concept, examples, and step markers are retained.
- Green emphasis uses the same subtle rounded-border treatment as Scripture. Indented
  example items in Steps 1 and 2 render as bullet lists. The closing prayer remains
  one content block, with its original stanzas and attribution intact.
- Individual/group reflection wording is separate from narration mode. Self Paced
  works for individuals and leaders using a projector. Present selects group questions,
  and the audience can also be chosen in the options menu in either mode.
- The native modal dialog stays within the viewport and scrolls for long prompts.
- Switching modes preserves the current page and visible content throughout the module.
- Keyboard arrows/Page Up/Page Down and horizontal swipes advance sections/pages.
  Ordinary taps on content do not advance, allowing selection and normal scrolling.
- Canonical participant text, Scripture, narration scripts, and existing Opus files are preserved.

## Published content

Schema `0.3` assigns stable human-readable IDs to content blocks. Teaching pages set
`presentation.reveal_blocks: true`; their title blocks use `type: "title"`.
`guided.segments` holds `{ block_id, text, audio }` mappings. The viewer follows canonical
block order and resolves narration by ID, rather than splitting paragraphs at runtime.
`reflection` contains the individual prompt; `guided.facilitator` contains the group prompt.

Run `npm run validate:course` to check IDs, narration references, reflection metadata,
and audio asset availability. The build runs this check automatically.
App/package version, displayed presentation version, published schema version, and
service-worker cache revision are separate fields.

## Offline startup and updates

Production opens the saved app immediately; it never waits for a network check
before displaying a cached lesson. Update checks run in the background when the
browser reports connectivity, and registration retries when connectivity returns.
Checks run on launch, every 15 minutes while visible, and on foreground/focus return
(foreground checks are limited to once per minute). Mobile background suspension
does not prevent a fresh check when the app is resumed. No update check is required
to open an already downloaded copy.

A downloaded update waits for the learner. A compact **↻ Update** button appears
beside the version, using the browser's waiting-worker lifecycle:
https://developer.chrome.com/docs/workbox/handling-service-worker-updates
Tapping saves the lesson state, activates the saved update, and reloads into it.
There is no automatic reload during a lesson. A ready update can also be applied
offline. Other open windows offer their own Update action rather than force a reload.

The one-time, per-window sessionStorage handoff preserves page/block IDs, visible
sections, mode, individual/group audience, in-app presentation, reflection state,
and narration voice choice. Narration remains stopped after reloading; browser
fullscreen requires another user gesture. This is not durable learner progress.
Missing pages/blocks after a curriculum update fall back safely to available content.
Storage or activation failure keeps the app open, shows an error, and allows retry.

Learning has no editable record forms yet. Future data-entry screens must register
an async `appUpdates.beforeUpdate` callback, block editing while saving/updating,
and await local database transaction completion before allowing activation/reload.
A failed save cancels the update. Pending cloud synchronization is independent of
local saving and must not require connectivity to apply a downloaded app update.

`npm run build` generates `dist/sw.js` from `public/sw.js` using
`scripts/build-service-worker.mjs`. Its manifest includes the built HTML, hashed
JavaScript/CSS, course JSON, manifest, logo, and icons. A content hash identifies
each release cache independently of app/content/schema versions. Required files
must all download successfully before the new worker replaces the previous one.
Core downloads time out after 8 seconds; optional narration/illustrations after
5 seconds. Missing optional media does not prevent installation. Successful later
full-media downloads are also saved. Cached recordings support byte-range requests.

Saved public files are served cache-first as one release, including when a server
adds `Vary: Origin` to responses. Missing files skip fetching when explicitly offline;
otherwise their network request has a 3-second connection/response-header timeout.
Activation removes only older caches belonging to this app.

Open the app online once and allow its download to finish before testing airplane
mode. Clearing website data or browser storage eviction removes the offline copy.
Local Vite development disables service workers; use the production build and
`npm run preview` for offline testing. `npm run test:offline` checks cached startup
against offline/stalled networks, incomplete updates, optional media, and range requests.
`npm run test:updates` covers pending writes, save/activation failure, retry, first
installation, long-running sessions, multiple windows, and the state handoff.

## Deployment rollback

Cloudflare Workers versions include static assets. An administrator can restore a
previous deployment through Workers & Pages > novoapps-newvines > Deployments >
the previous version's menu > Rollback, or use Wrangler with an explicit version ID.
See https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
and https://developers.cloudflare.com/workers/versions-and-deployments/.
This is a server deployment operation; it does not instantly replace an offline
device's saved app. Devices must reconnect and receive/apply the restored worker.
Update detection compares worker bytes, so it does not require a higher app version.

Another recovery option is to restore known-good source behavior and publish it as
the next patch version. Record release commits/tags and Cloudflare deployment IDs
when publishing. Neither option is an in-app offline Undo button: activation currently
removes older release caches. Such a feature would need deliberate previous-cache
retention and a recovery interface. Future database schema changes must also remain
compatible with supported app rollbacks; restoring app code does not restore data.

## Development and preview

```powershell
npm install
npm run build
npm run preview
```

Self Paced: `http://localhost:4173/`

Recorded narration starting page: `http://localhost:4173/#FGMM-M01-P005`

Guided: `http://localhost:4173/?mode=guided`

On systems where PowerShell blocks `npm.ps1`, use `npm.cmd` for these commands.

## Narration authoring

Existing audio is in `public/audio/guided-demo`. Do not regenerate narration unless
its script or audio needs to change. The generator reads the stable block mappings
and also understands the earlier parallel-array publication format.

`browser_tts` uses browser speech synthesis. `marin_opus` plays pre-generated Marin
Opus audio. One media element is reused across segments to retain playback permission
on phones; blocked autoplay asks for Resume rather than switching voices. A failed
recording shows an error and Retry; it never automatically substitutes browser speech.
The footer identifies Marin AI narration or browser voice. Learners can explicitly
choose Use browser voice / Use Marin recording in the options menu on narrated pages.
If audio is unavailable, manual section advancement remains available.
The first already-visible block starts
audio directly in the Narrate click; subsequent blocks retain the configured reveal lead.

`npm run generate:guided-audio` requires `OPENAI_API_KEY` configured locally in `.env`.
Never expose or commit that key. Future CMS generation must remain on the authoring side.

## Optional illustrations

Blocks may reference an image with `src`, optional `small_src`, localized `alt`,
dimensions, and `localization_policy: "LOCALIZE_IMAGE"`. Images appear beside text
on larger screens and below it on phones; missing images leave the lesson readable.
The module includes Kenya-audience illustrations in `public/assets/illustrations/`,
with 768px and 384px WebP variants. Existing icons remain alongside the images.
The service worker optionally caches these assets. The seven additional illustrations
total approximately 531 KiB across both sizes; reused scenes share asset URLs.
Prompts and the built-in image_gen provenance are in `scripts/illustration-prompts.json`.
Future CMS authoring should support uploads and approved generated illustrations.

| Scene | Canonical block(s) | Main asset |
| --- | --- | --- |
| Family meal / basic needs | P010-B002 | [needs-family-v1.webp](public/assets/illustrations/needs-family-v1.webp) |
| Soccer ball / optional purchase | P010-B003 | [wants-soccer-v1.webp](public/assets/illustrations/wants-soccer-v1.webp) |
| Setting money aside / emergency preparation | P007-B002, P014A-B002 | [saving-aside-kenya-v1.webp](public/assets/illustrations/saving-aside-kenya-v1.webp) |
| Helping a neighbour | P005-B004 | [generosity-neighbours-kenya-v1.webp](public/assets/illustrations/generosity-neighbours-kenya-v1.webp) |
| Bicycle as a tangible savings goal | P008-B003 | [bicycle-goal-kenya-v1.webp](public/assets/illustrations/bicycle-goal-kenya-v1.webp) |
| Listening and planning as a couple | P011-B003, P015C-B002 | [couple-planning-kenya-v1.webp](public/assets/illustrations/couple-planning-kenya-v1.webp) |
| Preparing for school needs | P014B-B002 | [school-needs-kenya-v1.webp](public/assets/illustrations/school-needs-kenya-v1.webp) |
| Writing down savings goals | P015B-B002 | [writing-goals-kenya-v1.webp](public/assets/illustrations/writing-goals-kenya-v1.webp) |
| Ants gathering food / diligence | P013-B004 | [ants-diligence-v1.webp](public/assets/illustrations/ants-diligence-v1.webp) |

Each file has a corresponding `-384.webp` phone variant. Graphics are supplemental
and marked for image localization; curriculum wording and narration are unchanged.
