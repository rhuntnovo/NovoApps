# ADR 0012: Provider-scoped authoring and source-linked translation drafts

Status: Accepted for local implementation on 2026-10-21.

## Decision

Keep NovoApps CMS/API applications outside newvines-learning. Seed New Vines International
as the first provider and scope course identities by provider. Keep providers distinct
from user identity and operational workspace ownership.

Support source course/module/page identities and linked language/country editions.
Preserve canonical wording, imported snapshots and existing delivery IDs. New records
and content IDs use UUIDv7. Authoring allows new modules, pages, blocks and narration
through explicit draft operations rather than requiring direct JSON editing.

Use server-side OpenAI translation with a write-only local key and validated text-only
structured output. Generated content is a draft. Source-linked revisions, comparison,
manual edits and local review state precede future authenticated approval/publication.
Do not silently replace reviewed translations or carry English recordings into Spanish.

Extract shared Preact page presentation into content-runtime, with host callbacks for
navigation and optional update preparation/UI. Learning-specific service worker,
update manager, storage and course loading stay in Learning. The preview imports no
Learning application source and registers no worker. This implements ADR 0009 and
supersedes the direct-import preview shortcut of historical ADR 0011.

## Limits

This pilot does not provide hosted reviewer access, authenticated approval, automatic
audio generation, a provider asset catalog or a publication pipeline. See docs/10 for
the exact implemented workflow and current limitations. Keep app/content/schema/asset
versions distinct; the deployed Learning release remains v0.8.3.
