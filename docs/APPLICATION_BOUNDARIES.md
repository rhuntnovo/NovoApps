# NovoApps Application Boundaries

**Status:** Architectural guidance  
**Last updated:** 2026-10-20

## Purpose

This document defines what belongs in each NovoApps application and what should be shared.

The purpose is to prevent the repository from evolving into tightly coupled applications or duplicated code.

---

# 1. Core Principle

Each deployable application should have one primary responsibility.

```text
platform-web  → identity/workspaces/platform entry
cms-web       → content authoring
learning-pwa  → course consumption/runtime
inventory-pwa → inventory operations
finance-pwa   → financial operations
api-worker    → server-side API/security/routing
```

Applications may share contracts and reusable libraries, but one application should not become the internal host of another.

---

# 2. `platform-web`

## Owns

- Registration
- Sign-in flows
- Email verification
- Password recovery
- Account/profile management
- Workspace creation
- Invitation acceptance
- Membership management
- Security settings
- App launcher
- Possibly subscription/licensing later

## Does not own

- Course editing
- Course rendering
- Inventory data entry
- Financial transactions
- Sync implementation
- Workspace business data

---

# 3. `cms-web`

## Owns

- Provider management
- Course structure editing
- Module/page/block editing
- Translation/localization
- Narration authoring metadata
- Draft/review/approval workflow
- Version management
- Publishing
- Content preview controls

## Does not own

- Learner offline behavior
- Learning PWA update handling
- User registration
- Inventory/finance business operations
- Authentication implementation itself

The CMS consumes shared authentication and content packages.

---

# 4. `learning-pwa`

## Owns

- Course runtime
- Published course loading
- Page navigation
- Self-paced mode
- Narrated mode
- Offline caching
- Runtime updates
- Learner-facing presentation
- Local learner progress where applicable

## Does not own

- Course authoring
- Translation workflow
- Publishing approvals
- Provider administration
- User invitations

---

# 5. `inventory-pwa`

## Owns

- Inventory items
- Purchases
- Sales
- Quantity changes
- Cost tracking
- Inventory history
- Offline inventory workflow

Common authentication and synchronization behavior should come from shared packages.

---

# 6. `finance-pwa`

## Owns

- Accounts
- Income
- Expenses
- Budgets
- Categories/chart of accounts
- Budget versus actual
- General-ledger-style views
- Offline finance workflow

---

# 7. `api-worker`

## Owns

- Authentication enforcement
- Authorization
- Workspace routing
- Input validation
- Business APIs
- CMS APIs
- Publishing APIs
- Synchronization APIs
- Logging
- Rate limiting
- Server-side security boundaries

Applications must not bypass this layer to directly access workspace databases.

---

# 8. What Should Be Shared

Good candidates for shared packages:

```text
content schemas
API contracts
Zod validation
authentication helpers
sync protocol
localization utilities
formatters
PWA update utilities
design tokens
content rendering
```

Poor candidates for shared packages:

```text
application-specific screens
navigation structures
business-specific forms
CMS-only editor widgets
Learning-only shell controls
```

---

# 9. Dependency Direction

Preferred:

```text
apps
 ↓
packages
```

Avoid:

```text
cms-web → learning-pwa source files
learning-pwa → cms-web source files
inventory-pwa → finance-pwa internals
```

Applications should communicate through:

- Shared packages
- APIs
- Published content contracts

not imports from another app.

---

# 10. CMS Preview Boundary

The CMS preview should not embed or depend on the entire Learning PWA application.

Instead:

```text
cms-web
   ↓
content-runtime package
   ↓
draft content
```

and:

```text
learning-pwa
   ↓
content-runtime package
   ↓
published content
```

The shared renderer is the bridge.

This gives high preview fidelity without coupling the two applications.

---

# 11. Rule for Future Applications

When considering a new feature, ask:

> Is this a new independently deployable user experience, a reusable platform capability, or merely part of an existing app?

If independently deployable:

```text
apps/<name>
```

If reusable capability:

```text
packages/<name>
```

If server-side domain behavior:

```text
services/api-worker/src/<domain>
```
