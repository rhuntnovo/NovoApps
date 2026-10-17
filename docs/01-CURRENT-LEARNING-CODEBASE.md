# New Vines Learning PWA --- Current Codebase

## Baseline

Current known baseline: **v0.8.0**. Stack: Vite + Preact + TypeScript +
PWA/offline support + Cloudflare Workers Static Assets. Node/npm
workflow. Known worker: `novoapps-newvines`.

Canonical Module 1 file: `public/courses/nvi-fgmm-m01.en-global.json`

Model: Course → Module → Page → Content Blocks. Module 1 has 20 pages.
Course files use `nvi-` prefix. Canonical curriculum wording must not
change except approved corrections.

## Unified Self Paced + Guided

v0.8.0 removed the separate Guided-demo course JSON. `guided` metadata
supplements the same canonical Page record. Current Guided prototype
pages are `FGMM-M01-P005`--`P008`.

Course Guided configuration includes 500 ms reveal lead and two
narration choices: - `Use Browser Text to Speech` -
`Marin Opus AI Audio` (OpenAI; only expose CMS generation option when an
API key is configured)

Never publish an API key to the client.

Guided behavior: - lightweight narrated/animated presentation, not
video - content section appears \~0.5 sec before narration - actual
audio completion controls progression - pause/resume - browser speech
synthesis fallback - fully rendered page remains after narration -
Continue opens facilitator instructions; X returns to rendered page -
active normal block gets temporary green left emphasis - Scripture keeps
permanent brown left/right emphasis while other blocks reveal - active
content auto-scrolls/moves above fixed controls - disclosure:
`AI-generated narration`

Selected production voice: **Marin**. Pre-generated compressed Opus
supports offline playback.

Generator: `scripts/generate-guided-audio.mjs`; command:
`npm run generate:guided-audio`. It reads unified course JSON.

## Navigation/UI

-   Guided button is left of Present.
-   Guided viewer has Self Paced button.
-   Guided URL: `?mode=guided`; old `?course=guided-demo` may remain
    backward compatible.
-   If current page lacks Guided metadata, Guided currently starts at
    first Guided page.
-   Course version moved into course band.

## Logo/title

Asset: `public/assets/NVI-logo-clear.png`. Title template uses real NVI
logo. Future module first/title pages should too. Future cleanup: derive
module number/theme from data instead of hardcoding Module 1.

## Important files

``` text
src/App.tsx
src/components/CourseViewer.tsx
src/components/GuidedDemoViewer.tsx
src/components/templates/TemplateRenderer.tsx
src/styles.css
src/types.ts
src/types/course.ts
public/courses/nvi-fgmm-m01.en-global.json
public/manifest.webmanifest
public/sw.js
scripts/generate-guided-audio.mjs
```

`src/types/course.ts` re-exports consolidated types from `src/types.ts`.

## Offline/deployment

Production service worker caches shell/course content and should cache
Guided audio. Missing optional audio must not break SW installation.
Development should avoid stale service-worker interference.

Vite builds `dist/`; Cloudflare Workers Static Assets serves it with SPA
fallback. Course JSON builds to `dist/courses/...` and is served under
`/courses/`.

## Versioning

Separate app/build, course/content, schema, and asset/audio versions. Do
not conflate course-visible version with app build version long-term.

## Known refinements/tests

-   portrait phone Continue vs narration controls
-   Scripture bar corner-wrap appearance
-   Guided auto-scroll with fixed controls/sticky header
-   Samsung/Android PWA install/update/offline lifecycle
-   cache invalidation/content updates
-   data-driven module title template
