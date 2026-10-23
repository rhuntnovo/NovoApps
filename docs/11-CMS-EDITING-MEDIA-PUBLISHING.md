# CMS editing, media, and publication (2026-10-23)

This increment extends the provider-based local CMS described in [docs/10](10-PROVIDERS-AUTHORING-TRANSLATION.md).
It does not deploy the CMS or replace Learning v0.8.3.

## Start and review

From C:\Development\NovoApps:

```powershell
npm.cmd install
npm.cmd run dev:cms
```

Open http://127.0.0.1:5174 (localhost:5174 also works).
The launcher migrates local D1, preserves existing imported drafts, and starts:
- CMS editor: 5174
- Preact preview: 5175
- local D1 API: 8787
- local media/publishing helper: 8789

Provider, Course, and Language/Context selectors remain above the scrolling workspace.
Course lists primary courses; Language/Context lists their source-linked editions with
friendly language/country labels. Create Language Edition opens an existing matching
module edition if it is already present. Open Primary Language returns to its source.
Edit Headings and Language/Locale sit together below the module heading.

Save and Cancel remain at the top of the content editor; unsaved status sits below them.
Cancel discards only the current unsaved draft. Preview includes phone/tablet portrait
and landscape and desktop sizes. Collapse Editor leaves the module/page panel visible.
Use the learner's own Self Paced/Guided control inside the preview.

Translate Remaining Pages immediately shows a determinate progress bar beside status.
Progress counts completed API operations (including initial heading translation), not
estimated token generation. Stop takes effect between pages; completed drafts remain saved.
Interrupted operations show an error and retained progress rather than claiming completion.

## Pages and content blocks

Select a primary-language page and use Add Page Below. Drag pages to reorder them;
Up/Down buttons provide a keyboard-friendly alternative. Order changes propagate to
existing linked editions in the same D1 batch. Newly synchronized source pages are
inserted into source order.

Delete Selected Page removes it from the active module and linked editions; Delete
Content Block removes its narration mapping too. At least one page and one block remain.
Earlier page revisions and module-order snapshots remain in D1. Restoration/history
does not yet have a UI. Structural authoring happens in the primary language; translations
retain canonical source identities. Primary deletion is reflected in linked editions.
Block types can be changed after creation and are shown in Title Case, as are layouts
and field labels. Wording/type changes remain review-required drafts.

Migration 0003 adds append-only cms_module_structures snapshots, UUIDv7 identifiers and
unique (module_id, revision) guards. Existing drafts fall back to their original order
until the first structure change. No import/reset or destructive migration is required.
The user's local state was backed up under services/api-worker/.wrangler/backups
before applying this migration.

## Narration and images

Every narration segment has a visible script, Narration File Location, playback,
Record Narration and Generate AI Narration.

Record Narration opens a dialog with the script, Start Recording, Stop Recording,
playback, Record Again, and Use Recording. Browser microphone permission is required.
Chrome/Edge/Safari on localhost or HTTPS are supported subject to browser capabilities.
Recording stops after ten minutes. The browser chooses supported WebM/Opus, Ogg/Opus,
or MP4 input; the Node helper converts it with FFmpeg to mono 48 kHz, 32 kbps Opus.
Use Recording attaches the returned URL to the draft; Save commits that reference to D1.

Generate AI Narration explicitly invokes gpt-4o-mini-tts with voice marin and Opus output.
A confirmation explains account usage. Scripts must be at most 4,096 characters.
Human recordings carry audio_source=human; generated recordings carry audio_source=ai.
The shared player distinguishes recorded narration from AI narration and keeps original
Marin recordings intact. Editing a script detaches its audio/source references; earlier
files and revisions remain.

Each block has Image Description, Upload Image, and Generate Image. Uploads accept PNG,
JPEG and WebP. Sharp normalizes images and writes 768px/384px WebP variants for the
shared renderer. Generate Image explicitly calls gpt-image-2 using block text, requested
description and edition country/language. Descriptions can be edited and images
regenerated. Full-page layouts, including prayer, also render attached illustrations.
Reflections show Suggested Time below their question/activity text for either audience.

Media buttons require the block to exist in a saved page. New output attaches to the
current draft and requires Save; generation does not silently save or approve curriculum.
API calls verify module/page/block ownership and saved revision before and after generation.
The shared write-only OpenAI setting is used for translation, narration and images.
Keys remain in local Worker memory or an ignored user-managed .dev.vars.local file.
No key is persisted into D1, browser storage, media files, publication manifests or logs.

Local assets are stored under services/api-worker/.wrangler/media:
- audio/cms/{provider}/{primary-course-code-and-UUID}/{language-locale}/{page-UUID-and-ID}/{block-ID}/{unique-file}.opus
- assets/cms/{provider}/{primary-course-code-and-UUID}/{language-locale}/{page-UUID-and-ID}/{block-ID}/{unique-file}.webp

New files never overwrite existing recordings/images. Raw conversion staging and
unreferenced output are retained locally for now; garbage collection is future work.
Back up the D1 state AND media directory to preserve authored content.
The helper and FFmpeg/Sharp dependencies are local authoring tools, outside learner bundles.
The API and helper bind only to loopback and reject untrusted browser origins; these
restrictions remain development safeguards, not hosted authentication.

## Publish

The upper-right Publish button opens a saved-module review dialog. Unsaved drafts must
be saved or cancelled first. The operator explicitly approves saved content, including
Scripture/media. Every translated page must be reviewed against the current source.
Metadata, structure and every page revision are checked before publication.

A new dedicated Cloudflare R2 bucket, novoapps-content, was created for public published
curriculum only. The user explicitly approved public read access for the entire bucket.
Initial public base URL:
https://pub-99c5b6d16ed64e6283483cda548e55f5.r2.dev

This non-secret destination is configured in the local helper settings. The public-read
CORS policy for the deployed Learning site and local development origins is in
tooling/r2-content-cors.json. A custom content domain and delivery policy should precede
broad production distribution; r2.dev is the initial development endpoint.

Publication uses the local Wrangler login. The browser never receives Cloudflare tokens.
It uploads an immutable module release under:

```text
{provider}/{primary-course-code-and-UUID}/{language-locale}/
  modules/{module-ID}/releases/{release-ID}/
    course.json
    manifest.json
    audio/...
    assets/...
  modules/{module-ID}/latest.json
```

The course document includes distinct content_version and asset_base_url fields.
The shared renderer resolves delivery media against that release's asset base.
The manifest records file sizes/hashes, the local approval, and reviewed revision snapshot.
All referenced local/legacy assets must resolve before any upload begins.
latest.json changes only after all release objects upload successfully and uses no-store caching; versioned release objects are immutable. Releases remain
available for later rollback; a rollback UI and history browser are not implemented.
Concurrent publication of the same module is rejected by the local helper.

Published packages are public; local drafts, raw inputs, credentials and databases are
never included. Publishing a package does not deploy Learning or change its hardcoded
Module 1 catalog. Learner catalog/download/import and controlled offline package
activation remain a separate milestone. Hosted authoring still requires validated
identity, provider permissions and attributable review before deployment.

## Verification

- npm.cmd run test:cms: 27 schema/API tests and a native media/publication integration test.
- npm.cmd run build:cms: API/editor/preview TypeScript and both app builds.
- Learning build plus 15 offline and 11 update tests pass.
- Isolated local D1/media plus real Chrome verified sticky headers/Save, edition switching,
  editor collapse, screen choices, real original Opus playback, simulated-microphone
  Start/Stop/Use Recording, saved Opus reference, image upload/WebP preview,
  drag-and-drop/insertion/deletion, block type/deletion and determinate translation progress.
- AI requests and R2 object uploads were stubbed during tests. No paid AI request or
  curriculum-content upload was made during implementation. Bucket preparation and
  public/CORS configuration were real cloud operations authorized by the user.

Official references:
- [OpenAI speech generation](https://developers.openai.com/api/docs/guides/text-to-speech)
- [OpenAI image generation](https://developers.openai.com/api/reference/resources/images/methods/generate)
- [Cloudflare R2 object upload](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)

## Crawler and indexing policy (2026-10-23)

Learning, CMS and preview ship robots.txt with User-agent: * and Disallow: /,
plus HTML robots metadata and Cloudflare Static Assets _headers with
X-Robots-Tag: noindex, nofollow, nosnippet, noimageindex. API/media responses and
CMS development/preview servers also send the indexing header. The Learning
service-worker build hashes deployment directives but excludes _headers and
_redirects from required cached URLs: Cloudflare consumes those files rather than
serving them as assets. robots.txt remains a normal downloadable cached file.

Future R2 publication uploads the media service's public/robots.txt to the BUCKET
ROOT before course objects. A robots.txt inside a course release directory would
not apply to the host. The policy applies to the entire dedicated content bucket.
Plain R2 does not interpret _headers and does not receive arbitrary X-Robots-Tag
headers from this uploader; add a serving Worker/custom-domain response policy if
header-based noindex enforcement on individual R2 objects is required.

These are voluntary crawler instructions, not authentication or protection against
scraping. Disallowed pages may still appear as URL-only search results if other
sites link to them: blocking crawling also prevents crawlers reading noindex tags.
Existing search results may require webmaster removal tools. Keep public content
and access-control decisions separate; do not claim these files make content private.

The source/build controls are verified locally; they take effect on live Learning
only after deployment, and on the R2 host on the next explicit content publication.
No live app deployment or R2 upload was performed for this change.

References: https://developers.google.com/search/docs/crawling-indexing/block-indexing
and https://developers.cloudflare.com/workers/static-assets/headers/.
## AI settings feedback correction (2026-10-23)

Saving an API key remains write-only and session-only. A local API restart or development
reload clears in-memory settings; the browser's former configured status could remain
stale. This behavior was reproduced in an isolated Wrangler Worker with a dummy key.
AI Settings now refreshes status when opened, keeps the dialog open after Save Settings,
reads back non-secret status before reporting success, and displays a clear confirmation.
Done closes the confirmed dialog. Failed saves preserve the typed password for retry;
keys are cleared from the input only after a successful save. Missing-key media errors
explain Save Settings and the API-restart limit. The optional user-managed ignored
.dev.vars.local configuration remains the way to persist across API restarts.

An added regression test covers replacement-key use by image generation, rejected-input
preservation, status secrecy and explicit disabling. All 28 schema/API tests and the
native media test pass; the CMS build passes. Real Chrome with an isolated Worker
verified save/reopen, refreshed missing-key status and simulated failed saves. No real
key was read or exposed and no OpenAI request was made for this diagnosis.
The subsequent [v0.8.4 bilingual release](12-LEARNING-BILINGUAL-RELEASE-AND-CMS-HOSTING.md) now stages approved R2 packages into the deployed offline viewer. It supersedes the earlier no-viewer-publication statements for that increment; CMS hosting and autonomous package activation remain future work.
