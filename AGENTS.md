# NovoApps --- Collaboration Context for Codex / AI Coding Agents

Read this file first before changing the repository. Then read the
relevant files in `docs/`.

## Non-negotiable rules

-   Preserve working behavior unless a requested change explicitly
    replaces it.
-   Never rewrite canonical New Vines curriculum wording except an
    explicitly approved correction/typo. Scripture is authoritative
    course content.
-   Keep PWAs lightweight, multilingual, offline-first, and suitable for
    low-end Android devices/intermittent connectivity.
-   Never commit `.env`, API keys, encryption keys, tokens,
    `node_modules/`, or `dist/`.
-   Prefer Preact + TypeScript + Vite and Node/npm unless an explicit
    architecture decision changes this.
-   Use stable distributed IDs. Prefer UUIDv7 (ULID only for a
    compelling implementation reason), not server auto-increment
    identity as a distributed primary key.
-   CMS/database is the editable authoring source; published course
    JSON/assets are optimized Learning-PWA delivery artifacts.
-   Keep app/build version, course/content version, schema version, and
    asset version conceptually separate.
-   Self Paced and Guided are presentations of the same canonical page.
    Never duplicate canonical participant content for Guided mode.
-   Sensitive cloud sync uses a minimal clear synchronization envelope
    plus encrypted payload. Data residency still matters.
-   Make large changes incrementally and test them.
-   Active development root is `C:\Development\NovoApps`, outside
    OneDrive. Git/GitHub provides source history.

## Intended repository

``` text
NovoApps/
├─ AGENTS.md
├─ docs/
├─ newvines-learning/
├─ newvines-inventory/   # future recreation/migration
├─ newvines-finance/     # future
└─ shared/               # only when repeated requirements justify extraction
```

Current deployed Learning baseline is v0.8.3. The shared section viewer is used throughout Module 1; see docs/01.
Self Paced is manual advancement for an individual or group/projector. Individual/group questions are independent of narration mode.

Learning v0.8.3 includes immediate cached startup and a user-controlled
update button. Keep startup independent of network/update checks, and await local
save/transaction callbacks before applying an update; see docs/01. Cloud synchronization
is separate from saving local changes.

Before Learning work read `docs/01-CURRENT-LEARNING-CODEBASE.md` and
`docs/02-LEARNING-CMS-ARCHITECTURE.md`. Before platform/data work also
read docs 03--05. Before Inventory work read doc 06; before Finance work
read doc 07. Open decisions/sequence are in doc 08.

Typical validation:

``` powershell
npm run build
npm run preview
```

Run `npm install` when dependencies need installation. Do not regenerate
AI narration unless narration/audio changed. Never request, expose, or
commit the user's API key.
