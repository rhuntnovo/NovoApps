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
