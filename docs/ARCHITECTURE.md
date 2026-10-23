# NovoApps architecture entry point

NovoApps is the platform; New Vines International is its first content provider.

Use [application boundaries](APPLICATION_BOUNDARIES.md), the
[provider model](CONTENT_PROVIDER_MODEL.md), and the
[repository structure](REPOSITORY_STRUCTURE.md) with the accepted [ADRs](ADR/).
The larger [platform proposal](NEW_VINES_PLATFORM_ARCHITECTURE.md) provides context;
newer accepted decisions and root AGENTS.md take precedence over its earlier examples.

Current implementation: [local authoring and translation](10-PROVIDERS-AUTHORING-TRANSLATION.md).
Historical milestone: [initial CMS](09-LOCAL-CMS-MILESTONE.md).

- React CMS and Preact preview are separate applications under apps/.
- Preact page presentation is shared through packages/content-runtime.
- Content schemas/types live in packages/content-model; the learner uses erased types.
- Hono/Drizzle use local D1 for provider-scoped content and revisioned drafts.
- Learning consumes delivery JSON/media, not CMS tables, and retains offline/update ownership.
- platform-web will own identity/account/workspace UI; hosted review requires authenticated
  provider permissions in the API and central control database.
- Operational workspaces, IndexedDB sync, sensitive-data encryption and residency follow
  docs/03/04 and their ADRs; they are separate from content-provider ownership.

Root npm workspaces cover apps/services/packages. Existing newvines-learning remains
in place with its own package/build command. A later folder move is a separate task.

Current media/publication increment: [CMS editing, media and publishing](11-CMS-EDITING-MEDIA-PUBLISHING.md). A loopback Node helper owns local FFmpeg/Sharp conversion and authenticated Wrangler R2 uploads. Editable content stays in local D1; published module packages and media use provider/course/language-scoped immutable R2 releases. Learner catalog activation and hosted authenticated review remain future work.

The public Learning viewer is now v0.8.4 with approved English/Spanish immutable offline snapshots. See [bilingual release and CMS readiness](12-LEARNING-BILINGUAL-RELEASE-AND-CMS-HOSTING.md) for the verified staging/deployment workflow and remaining hosted identity/D1/media work. CMS and authoring D1 remain local.
