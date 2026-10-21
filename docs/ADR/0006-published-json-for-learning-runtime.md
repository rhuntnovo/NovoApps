# ADR 0006: Use Published Versioned JSON for the Learning Runtime

**Status:** Accepted  
**Date:** 2026-10-20

## Context

The Learning PWA must:

- Work offline
- Load quickly
- Run on low-end devices
- Avoid dependence on a live CMS
- Support multiple languages and locales
- Preserve approved canonical curriculum content

The existing Learning PWA already uses JSON course content.

## Decision

The CMS is the authoring system, but the Learning PWA consumes **published, versioned JSON course packages**.

Publishing flow:

```text
CMS
 ↓
Validate
 ↓
Build course package
 ↓
Assign version
 ↓
Publish JSON/media
 ↓
Cloudflare R2/CDN
 ↓
Learning PWA
 ↓
Offline cache
```

## Content Model

Retain the established hierarchy:

```text
Course
  Module
    Page
      ContentBlock
```

Published files may follow patterns such as:

```text
nvi-fgmm-m01.en-global.json
nvi-fgmm-m01.es-ni.json
```

or a future versioned directory structure.

## Rationale

This approach provides:

- Offline reliability
- Fast delivery
- Easy CDN caching
- Simple rollback
- Explicit content versions
- CMS independence during course delivery
- Straightforward multilingual packaging

## Canonical Content

The CMS must preserve a distinction between:

- Canonical source content
- Translation
- Localization
- Presentation

A change to canonical content should be able to invalidate or flag related translations for review.

## Consequences

The Learning PWA should not query the CMS database directly for ordinary page rendering.

Publishing becomes an explicit controlled operation.
