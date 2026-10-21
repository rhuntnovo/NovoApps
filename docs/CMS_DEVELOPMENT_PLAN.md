# CMS Development Plan

**Status:** Recommended implementation sequence  
**Last updated:** 2026-10-20

## Purpose

This document defines the recommended path for building the NovoApps CMS without destabilizing the existing Learning PWA.

The immediate objective is a **local CMS with high-fidelity preview and export** before introducing registration, cloud persistence, or multi-user editing.

---

# 1. Why Build the Local CMS First

The highest-risk question is not authentication.

It is whether the CMS can accurately author, preview, and publish the same content model the Learning PWA already renders successfully.

Therefore validate:

```text
Edit
 ↓
Preview
 ↓
Export/Publish
 ↓
Learning PWA
```

before adding platform infrastructure.

---

# 2. Do Not Build CMS Inside Learning

Do not create:

```text
newvines-learning/cms/
```

The CMS should be a separate application:

```text
apps/cms-web/
```

The Learning PWA and CMS should share stable packages instead of importing each other's application code.

---

# 3. Step 1 — Protect the Existing Learning PWA

Before restructuring:

- Confirm current build succeeds
- Commit current working state
- Record current version
- Confirm narrated and self-paced pages work
- Confirm offline mode works
- Confirm update mechanism works

Treat this as the behavioral baseline.

---

# 4. Step 2 — Establish Application Boundaries

Create or plan:

```text
apps/
packages/
services/
database/
docs/
```

Do not perform a large refactor and CMS build in one change.

---

# 5. Step 3 — Extract `content-model`

First shared package:

```text
packages/content-model/
```

Move or recreate framework-independent definitions for:

- Course
- Module
- Page
- Blocks
- Narration
- Localization
- Version metadata

Use TypeScript and Zod.

The Learning PWA should consume the package with no visible behavior change.

---

# 6. Step 4 — Identify the Minimal Content Runtime

Review the current Learning code and identify reusable rendering logic.

Likely candidates:

```text
PageRenderer
BlockRenderer
template selection
Scripture rendering
Prayer rendering
narration sequencing
content animations
```

Do not initially extract:

```text
Learning navigation shell
install UI
update prompts
offline app shell
course-selection screen
learner-specific controls
```

Create:

```text
packages/content-runtime/
```

only for rendering behavior genuinely shared by Learning and CMS preview.

---

# 7. Step 5 — Create `apps/cms-web`

Recommended stack:

```text
React
TypeScript
Vite
shadcn/ui
Zod
```

Initial CMS runs locally.

No production authentication is required yet.

---

# 8. Initial CMS Features

First version should support:

- Open/import course JSON
- Course metadata
- Module list
- Page list
- Page editing
- Content-block editing
- Reordering blocks
- Narration fields
- Locale metadata
- Validation
- Live preview
- Export valid runtime JSON

Avoid initially:

- User registration
- Cloud database
- Roles
- Email invitations
- Workflow approvals
- Simultaneous collaboration

---

# 9. Preview Strategy

Preview should use the same shared content renderer as the Learning PWA.

Conceptually:

```text
CMS editor state
      ↓
content-runtime
      ↓
Preview
```

Production:

```text
Published JSON
      ↓
content-runtime
      ↓
Learning PWA
```

This is preferred over maintaining a separate CMS-only approximation of the learner view.

---

# 10. Round-Trip Test

Before moving to cloud persistence, demonstrate:

1. Import the current Module 1 JSON.
2. Edit a known page.
3. Preview it in CMS.
4. Export the course JSON.
5. Load the exported JSON in Learning.
6. Verify identical presentation behavior.
7. Verify narrated page behavior.
8. Verify self-paced page behavior.
9. Verify schema validation.
10. Verify no unintended changes to untouched content.

This becomes an important architecture milestone.

---

# 11. Step 6 — Add CMS Persistence

After local editing works:

```text
nvi-content D1
```

Add:

- Providers
- Courses
- Modules
- Pages
- Blocks
- Translations
- Draft versions
- Publishing metadata

The local/runtime model and CMS database model do not need to be identical.

A publishing transform should create the lean runtime JSON.

---

# 12. Step 7 — Add Platform Authentication

After CMS fundamentals work, integrate:

```text
apps/platform-web
Better Auth
nvi-control D1
```

Then add CMS authentication and permissions.

---

# 13. Step 8 — Multi-User Content Workflow

Add only after basic persistence/authentication:

- Editor identity
- Change history
- Optimistic concurrency
- Translation assignment
- Review state
- Approval
- Publishing permissions

Full simultaneous collaborative text editing is not required initially.

---

# 14. Content Provider Support

Provider must be part of the model from the start.

New Vines should be seeded as the first provider rather than hard-coded into CMS application logic.

---

# 15. Codex Instructions for CMS Work

Before modifying code, Codex should read:

```text
docs/ARCHITECTURE.md
docs/REPOSITORY_STRUCTURE.md
docs/APPLICATION_BOUNDARIES.md
docs/CONTENT_PROVIDER_MODEL.md
docs/CMS_DEVELOPMENT_PLAN.md
docs/ADR/*
```

When asked to begin the CMS:

1. Do not place CMS code inside the Learning app.
2. Do not rewrite the existing Learning renderer from scratch.
3. Identify reusable boundaries before extracting code.
4. Propose substantial repository moves before executing them.
5. Preserve current Learning behavior after each extraction.
6. Use New Vines as a provider record, not a platform assumption.
7. Keep Preact for the Learning PWA.
8. React is acceptable for the CMS.

---

# 16. Definition of Success for the First CMS Milestone

The first CMS milestone is successful when:

> A local editor can import existing New Vines course content, modify it, preview it using the shared runtime, export valid course JSON, and load that JSON into the existing offline Learning PWA without requiring manual source-code edits.

Authentication, D1 persistence, invitations, and multi-user editing come after this milestone.
