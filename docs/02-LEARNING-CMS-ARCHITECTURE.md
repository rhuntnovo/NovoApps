# New Vines Learning --- Planned CMS

## Goal

The CMS/CMA becomes the editable authoring source while the learner PWA
stays lightweight.

``` text
CMS database + asset storage
        ↓
validation / publishing
        ↓
course JSON + catalog + assets + Opus + facilitator resources
        ↓
CDN/object storage
        ↓
Learning PWA
  ├─ Cache Storage: shell/content/media
  └─ IndexedDB: catalog/state/progress/metadata
```

Published JSON is a delivery artifact, not the authoring source.

## One canonical page

Do not keep Self Paced and Guided copies. One Page contains: - canonical
visible participant content - template/layout - optional Guided
narration/reveal mapping/facilitator instructions/audio references -
localization/version/publication metadata

Likely authoring entities: Course, Module, Page, ContentBlock,
PageGuidedConfig, NarrationSegment, FacilitatorInstruction, Asset,
Locale/Translation, Publication, PublishedArtifact.

Page content must support title, teaching, Scripture, concepts, steps,
questions, exercises, prayer, facilitator guidance, images, narration,
ordering, template, locale and publication state.

## Guided authoring

CMS should support: - enable Guided - narration segments - map narration
to canonical visible block/section - facilitator prompt and estimated
time - choose `Use Browser Text to Speech` or `Marin Opus AI Audio` -
generate/re-generate audio - preview sequence - validate assets before
publishing

Marin generation appears only when an OpenAI API key is configured
server-side/local-authoring-side. Never publish the key.

## Localization

Support locale artifacts such as `en-global` and `es-ni`. Nicaragua
Spanish rules include approved NTV Scripture usage and approved
Nicaragua localization without silently changing theology/canonical
teaching. Narration may be localized independently later.

## IDs/version/publication

Stable IDs survive filename/display-name changes. Human IDs like
`FGMM-M01-P005` can coexist with UUIDs. Prefer UUIDv7 for new
operational records.

Track stable ID, schema version, content revision, locale, status,
created/updated user/time, published time, artifact version/hash.

Likely states: draft → review → approved → published →
archived/superseded.

## Catalog

Publish a catalog/manifest for discovery and versioning rather than
hardcoding courses. It should enumerate course/module IDs, locales,
content URLs and versions.

## Assets

Use stable asset identity and version-aware URLs/hashes. Reference large
media from JSON rather than embedding it. Published education media
belongs in CDN/object storage and PWA Cache Storage.

## Build sequence

1.  Formalize published JSON schema/stable IDs.
2.  Add schema/content versioning and catalog.
3.  Model CMS database.
4.  Course/module/page/block editor.
5.  Preview using real renderer where practical.
6.  Guided narration/facilitator editor.
7.  Asset management.
8.  Localization.
9.  Validation/approval/publication.
10. Controlled narration generation.

## Published shared-viewer schema

The published Learning schema 0.3 uses stable ContentBlock.id values and
Page.presentation.reveal_blocks for incremental display. Guided segments reference
block_id and hold supplemental narration text/audio; both modes render the same
canonical block. Reordering blocks does not change narration-to-block identity.
Individual reflection prompts (Page.reflection) and facilitator group prompts
(Page.guided.facilitator) are audience variants of an activity, not copies of
canonical participant teaching. The section viewer now covers all teaching pages;
pre-generated recorded narration still covers P005--P008.
CMS preview and publication should preserve this shared renderer and validate
all block references and media. Physical CMS SQL design remains open.

## Narration settings and write-only API credentials

Requested CMS setting: **Use AI generated Audio for Narration**. When enabled,
show a masked/password field for pasting an OpenAI API key, restricted to authorized
settings administrators. Saving sends the key over HTTPS to the authoring server;
store it in a server-side secret manager or protected environment configuration.
After saving, return only a configured/not-configured indicator, never the full key.
Provide replace/revoke actions instead of redisplaying a retrievable secret. Authors
may be allowed to generate approved audio without permission to read/manage credentials.
Generation runs server-side (or in the existing trusted local-authoring script), and
published course JSON/PWA bundles/caches must contain only media references, never keys.

A password field masks on-screen text but does not make a browser-held key impossible
to inspect/copy. Prevent reuse by other CMS users through write-only credential APIs,
authorization, server-side storage, and secret-free responses/logs. Do not promise that
input masking alone protects the key. Official OpenAI authentication guidance:
https://developers.openai.com/api/reference/overview#authentication

Disabling AI generation leaves browser TTS available and does not delete published
recordings. Playback choice, authoring permission, and generation configuration are
separate settings. Existing recorded Opus playback requires no API key on learner devices.

## Audience and illustration authoring

Self Paced means manually advanced, for an individual or a leader/projector group.
Guided adds optional narration. Individual/group activity wording is an independent
setting shared by both modes. Preserve leader-controlled reveals in Present mode.

CMS asset authoring should allow uploaded or generated context-appropriate graphics
attached to canonical block IDs, with localized alt text, explicit LOCALIZE_IMAGE policy,
approval/provenance, and versioned optimized variants. Use responsive sizes and retain
existing icons. Images are supplemental: the canonical text and normal offline operation
must remain available if optional images fail. The current needs/wants page demonstrates
an East African family meal and a soccer ball; locale-specific variants can replace them
without rewriting the teaching. Never put an image-generation credential in published data.
