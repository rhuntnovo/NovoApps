# ADR 0009: Share the Content Runtime Between Learning and CMS Preview

**Status:** Accepted  
**Date:** 2026-10-20

## Context

The existing Learning PWA contains substantial rendering behavior for:

- Self-paced pages
- Narrated pages
- Content blocks
- Templates
- Scripture/prayer presentation
- Animation and sequencing

The CMS needs accurate preview.

Duplicating this renderer in the CMS would create drift between preview and production.

Importing the entire Learning application into the CMS would create excessive coupling.

## Decision

Extract reusable content rendering into:

```text
packages/content-runtime
```

Both:

```text
apps/learning-pwa
apps/cms-web
```

should consume this package.

Framework-independent content contracts should live in:

```text
packages/content-model
```

## Guardrail

Only reusable runtime behavior should move into `content-runtime`.

Learning-specific application shell concerns such as update UI, PWA install behavior, learner navigation, and offline shell management remain in `learning-pwa`.

## Migration Strategy

Extract incrementally.

After each extraction, verify that current Learning behavior is unchanged.

Do not perform a broad renderer rewrite solely to create the package.
