# NovoApps Repository Structure

**Status:** Proposed target structure  
**Last updated:** 2026-10-20

## Purpose

This document defines the intended source-code organization for the NovoApps platform.

The goal is to keep each deployable application independent while sharing stable, reusable code through packages.

The platform should not evolve into one large application containing Learning, CMS, Inventory, Finance, and identity features.

---

# 1. Repository Model

NovoApps should use a monorepo.

Recommended target:

```text
NovoApps/
│
├── apps/
│   ├── platform-web/
│   ├── cms-web/
│   ├── learning-pwa/
│   ├── inventory-pwa/
│   ├── finance-pwa/
│   └── admin-web/              # optional/future
│
├── services/
│   └── api-worker/
│
├── packages/
│   ├── content-model/
│   ├── content-runtime/
│   ├── auth-client/
│   ├── api-client/
│   ├── sync-engine/
│   ├── pwa-core/
│   ├── localization/
│   ├── design-tokens/
│   └── utilities/
│
├── database/
│   ├── control/
│   ├── content/
│   └── workspace/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── REPOSITORY_STRUCTURE.md
│   ├── APPLICATION_BOUNDARIES.md
│   ├── CONTENT_PROVIDER_MODEL.md
│   ├── CMS_DEVELOPMENT_PLAN.md
│   ├── CONTENT_MODEL.md
│   ├── SYNC_PROTOCOL.md
│   ├── SECURITY.md
│   └── ADR/
│
├── scripts/
├── package.json
├── package-lock.json
└── tsconfig.base.json
```

---

# 2. Applications

## `apps/platform-web/`

The central user-facing platform application.

Responsibilities may include:

- Registration
- Sign in
- Email verification
- Password recovery
- Invitation acceptance
- Profile management
- Workspace creation
- Workspace membership management
- Application launcher
- Account/security settings

This is the preferred name instead of `account-web` because its role may grow beyond account management.

It should not contain business features from Inventory, Finance, Learning, or the CMS.

---

## `apps/cms-web/`

The content management application.

Responsibilities:

- Providers
- Courses
- Modules
- Pages
- Blocks
- Translation
- Localization
- Narration metadata
- Review
- Approval
- Versioning
- Publishing
- Preview

The CMS should be a sibling of the Learning PWA, not a folder inside it.

---

## `apps/learning-pwa/`

The lightweight Preact course runtime.

Responsibilities:

- Consume published course packages
- Render pages
- Self-paced presentation
- Narrated presentation
- Offline use
- Course updates
- Local learner state

The Learning PWA should not contain CMS editing logic.

---

## `apps/inventory-pwa/`

Preact offline-first operational application for inventory.

---

## `apps/finance-pwa/`

Preact offline-first operational application for personal/business finance and budgeting.

---

# 3. Service Layer

## `services/api-worker/`

The primary Cloudflare Worker API.

Use Hono and organize routes by domain.

Example:

```text
src/
├── auth/
├── platform/
├── workspaces/
├── cms/
├── publishing/
├── inventory/
├── finance/
├── sync/
└── middleware/
```

Do not begin with separate microservices unless a real operational need appears.

---

# 4. Shared Packages

## `packages/content-model/`

Framework-independent course/content contracts.

Contains:

- TypeScript types
- Zod schemas
- Page/block definitions
- Narration structures
- Locale structures
- Runtime package schemas

This should become the contract shared by CMS, Learning, validation, publishing, and tooling.

---

## `packages/content-runtime/`

Reusable rendering behavior extracted from the Learning PWA.

Potential contents:

- Page renderer
- Block renderer
- Template rules
- Scripture rendering
- Prayer rendering
- Narration sequencing
- Animation/presentation logic that is genuinely reusable

This package should remain compatible with Preact.

Do not move application shell/navigation/offline-update behavior here.

---

## `packages/pwa-core/`

Only for generic PWA behavior proven to be reusable.

Possible responsibilities:

- Update detection
- Version reporting
- Offline status
- Cache lifecycle helpers
- Install helpers
- Common local-storage helpers

Do not create this package prematurely.

---

## `packages/auth-client/`

Framework-independent helpers for:

- Session state
- Token/session refresh
- API authentication
- Workspace identity context

React and Preact wrappers may exist separately if required.

---

## `packages/api-client/`

Typed API communication shared by applications.

---

## `packages/sync-engine/`

Shared synchronization contracts and logic for offline operational PWAs.

---

# 5. Package Rule

A package should exist only when:

1. At least two applications genuinely need the behavior, or
2. The code represents an important platform contract that should not belong to a single application.

Do not extract code simply to make the repository appear more modular.

---

# 6. Migration From Current `newvines-learning`

The current Learning PWA should remain functional throughout restructuring.

Current migration sequence (updated 2026-10-21):

1. Keep newvines-learning in place with its independent package/build command.
2. Establish root npm workspaces and separate apps/services/packages (implemented).
3. Consolidate shared content contracts and extract shared page presentation (implemented).
4. Build provider-aware authoring and linked translation review (implemented locally).
5. Verify learner/offline/update behavior after each extraction.
6. Consider apps/learning-pwa as a separate later move, including deployment-path checks.

The target tree above is not an instruction to move all applications now.
Do not create unused shared packages, or move Inventory/Finance placeholders prematurely.

---
# 7. Workspace Tooling

Use a JavaScript/TypeScript workspace manager using the existing npm workspaces.

Benefits:

- Shared local packages
- Single dependency graph
- Efficient installs
- Consistent tooling
- Easy cross-app development

Each application should remain independently buildable and deployable.

---

# 8. Naming Principles

Use neutral platform names where the capability may serve multiple organizations.

Preferred:

```text
platform-web
cms-web
learning-pwa
content-model
content-runtime
```

Avoid unnecessarily hard-coding New Vines into reusable platform package names.

New Vines International is a content provider and platform customer, even if it is currently the primary provider.
