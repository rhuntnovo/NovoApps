# ADR 0008: Use a Monorepo With Separate Deployable Applications

**Status:** Accepted  
**Date:** 2026-10-20

## Context

NovoApps is expanding beyond the Learning PWA to include:

- Platform registration/account management
- CMS
- Inventory
- Finance
- Shared API infrastructure

Placing these capabilities inside the existing Learning project would couple unrelated applications and make future deployment and maintenance difficult.

At the same time, separate repositories would make shared TypeScript contracts and reusable code harder to manage.

## Decision

Use a monorepo with separate application folders.

Target structure:

```text
apps/platform-web
apps/cms-web
apps/learning-pwa
apps/inventory-pwa
apps/finance-pwa
services/api-worker
packages/*
```

Each application remains independently buildable and deployable.

Shared behavior is provided through packages.

## Consequences

- The CMS must not reside inside the Learning PWA.
- Inventory and Finance become sibling applications.
- Framework-independent contracts should be extracted into packages.
- Applications must not import source directly from other applications.

## Migration

Restructure incrementally and preserve the current Learning PWA behavior after each step.
