# New Vines Learning PWA v0.8.2

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
