# Providers, authoring and translation pilot

Date: 2026-10-21. Status: local implementation; not deployed.
The public New Vines Learning release remains v0.8.3.

## Start and use

From C:\Development\NovoApps:

```powershell
npm.cmd install
npm.cmd run dev:cms
```

Open http://localhost:5174/ or http://127.0.0.1:5174/.
Refresh an already open editor after this update. Migrations preserve existing drafts.
A pre-migration copy is retained in ignored services/api-worker/.wrangler/backups/.

1. Select a provider and source course.
2. Use **Add module**, **Add page**, and **Add content block** to build the remaining
   English modules. New content has UUIDv7 IDs. Imported content/IDs are retained.
3. Use **Narration → Add narration for content blocks** even on previously unmapped
   pages. Edit each segment and save. Browser voice is explicit for new scripts;
   approved existing /audio/*.opus references can be attached. No audio is generated.
4. Select an English module and choose **Create language edition**, language **es**,
   country/region **NI**. Each module has its own linked edition. This works for
   the existing Module 1 and for new modules.
5. Open **Translation settings** to configure the OpenAI key and model.
6. **Auto-translate page** translates one page. **Translate remaining pages** translates
   only untranslated pages, with progress and a stop-between-pages action. On its
   first run it also translates course/module headings. Edited/reviewed pages are
   skipped; regenerating them requires explicit confirmation.
7. In **Translation**, compare source/target text, edit Spanish, add reviewer notes,
   and **Save and mark reviewed**. Review Scripture against the authorized Spanish
   Bible edition. Generated text must not be represented as an official NTV quotation.
8. Edit/retranslate headings explicitly when needed. Export downloads draft JSON
   for review, not an approved publication.

The editor UI remains English; learner navigation/reflection controls support English
and Spanish based on course language. Other course languages can be authored, with
English interface labels until their UI dictionaries are added. Interface language
and course language remain separate concerns.

## Data and provider boundaries

The CMS, preview and API live outside newvines-learning. New Vines International
is a seeded provider row with a fixed UUIDv7, not the platform identity.
Providers are not operational workspaces or per-provider authentication databases.

D1 has provider-scoped course identities: (provider_id, canonical_id, locale).
Each edition has its own course row linked by source_course_id to the canonical row.
Modules link by source_module_id; edition pages link by source_page_id.
Existing human-readable page/block IDs remain stable within each delivery document.
New authoring records and new published page/block identities use UUIDv7.

Language and country/region are distinct inputs. The existing delivery language/country
fields and identifiers such as en-global and es-ni remain compatible. Inputs support
a language code with optional script, global, ISO-style two-letter country codes, or
three-digit region codes. This is not an implicit geographic fallback hierarchy.
No country is inferred from language; no automatic cross-language content fallback occurs.

All page changes append revisions and enforce expected revisions. Structure additions
are explicit; existing block IDs cannot be renamed/deleted through a normal save.
New modules start with one draft page. Page/module deletion and page reordering are
not included. Existing icons and media references survive unchanged edits.

A translation revision records the source revision it was based on, local review state,
and reviewer notes. Subsequent source page revisions display **Source changed**.
New source pages can be added to an existing edition through the synchronization action
without replacing translated pages. Source block-structure changes currently require
explicit page regeneration; existing reviewer edits are not automatically overwritten.
All prior page revisions remain in D1, although a history/restore UI is future work.

Module/course display headings are versioned per module as an authoring overlay.
They are explicitly editable/translatable; automatic stale detection currently covers
page revisions, not changes to the source headings. A normalized course-level heading
translation workflow and heading review history remain future refinements.

Edition creation retains visible source text as an explicitly **untranslated** draft.
It is not a translated fallback suitable for publication. Draft export can contain
untranslated/unreviewed fields and warns before download. There is no publish API.

## Translation safety and credentials

Generation is a server-side Responses API call with strict structured output. Only
whitelisted text fields are translated; IDs, icons, media paths and presentation metadata
are copied by application code. Output field identities and content schemas are validated.
AI cannot select a source document supplied by the browser. Results are revision checked;
failed, refused, malformed or stale generation leaves the existing draft unchanged.

The default model is gpt-5-mini and is configurable. No paid generation is triggered
by opening a page, saving a draft or configuring a key. A page/module generation action
asks for explicit confirmation. Batches save each completed page; retries skip pages
already translated. Requests have a timeout, store:false and no automatic paid retry.
This is a local sequential workflow, not a durable background translation queue.

The password input is write-only: saving clears it, APIs return configured status/model,
and logs/responses never return credentials or OpenAI error bodies. The local Worker
holds a submitted key in memory for at most 12 hours or until restart. It does not
persist a submitted key in D1, localStorage, sessionStorage or published packages.
For persistence, the user may configure OPENAI_API_KEY in
services/api-worker/.dev.vars.local (ignored), with optional OPENAI_TRANSLATION_MODEL.
Do not copy secrets from the learner's environment or request them in chat.
Disabling a key in the UI overrides environment configuration for the current API session;
restart restores any environment configuration.

English recordings are detached when creating translated editions. Editing a recorded
segment detaches its old audio reference; the file and earlier revision remain intact.
Translation does not create Spanish audio or culturally adapt image choices, money
amounts, examples or Scripture editions automatically. Those are explicit human tasks.

Official implementation references:
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)
- [API authentication](https://developers.openai.com/api/reference/overview)

## Shared renderer and delivery

packages/content-runtime holds the existing Preact page player, templates, block rendering,
reflections, narration hook, styles and English/Spanish controls. Shared content types
are derived from content-model's schema through a type-only runtime entry, keeping Zod
out of the learner JavaScript bundle.

Learning owns course loading, page navigation state, browser URL, presentation shell,
service worker, update manager and session handoff. It injects version/update UI and
save callbacks into the shared page player. The preview owns its own navigation state,
imports no Learning source, does not access learner storage and registers no worker.
No broad learner-folder move or framework conversion was performed.

Title pages render authored/translatable text and module metadata. New Vines logo
selection belongs to the host configuration, not generic title rendering. Existing
Module 1 cover presentation, icons, reveals, prayer and recorded narration are preserved.
Legacy template rules keyed by existing page IDs and English emphasis rules remain
compatibility debt to replace later with explicit approved presentation metadata.

Preview preserves existing learner media and also serves provider-scoped authoring assets.
The subsequent recording/image/versioned R2 publication increment is documented in docs/11.
Learning still loads its existing published Module 1; a catalog/package import and
controlled R2 publication are subsequent work. CMS drafts do not update the live PWA.

## Access boundary and next work

This remains a local authoring pilot. Local review status has no authenticated reviewer
identity and is not a production approval workflow. The Nicaraguan reviewer cannot yet
use a hosted collaborative link. platform-web, validated Better Auth/control D1,
provider permissions and audit attribution must precede hosted access.

Next: authenticated shared review, revision/history UI, provider assets and approved
Scripture handling, course-level translations, controlled narration generation, and
immutable versioned publication/catalog support. Inventory/Finance synchronization and
workspace Durable Objects remain separate later capabilities.

## Validation evidence

- 23 contract/API tests pass, including an existing-draft migration, seven-module
  creation, provider isolation, concurrent saves/module numbers, stable identities,
  translation review/source-change tracking, and rejected/stale/malformed AI output.
- CMS TypeScript and production editor/preview builds pass.
- Learning build plus 15 offline and 11 update tests pass after extraction.
- An isolated Wrangler D1 and real Chrome session exercised module/page/block/narration
  creation, Spanish comparison/review save/reload, masked write-only settings, source
  change notices, phone/tablet/desktop widths, translated covers and another provider.
- Existing Module 1 export remains JSON-value identical; all 20 pages, Scripture icons,
  reveals and original Opus playback were checked in the shared preview.
- A static single-block prayer page can now have narration without progressive reveals.
- AI requests were stubbed for tests. No real key was read and no paid request was made.
## Editing, media and publication update (2026-10-23)

[Docs/11](11-CMS-EDITING-MEDIA-PUBLISHING.md) supersedes the earlier media/publication deferrals above. It documents current Opus recording/Marin generation, image uploads/generation, linked page structure history, compact editor and explicit R2 package publication. Hosted review and learner catalog activation are still future work.
