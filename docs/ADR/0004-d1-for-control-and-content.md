# ADR 0004: Use Cloudflare D1 for Central Control and CMS Content

**Status:** Accepted  
**Date:** 2026-10-20

## Context

The platform needs shared relational databases for two distinct concerns:

1. Platform identity, membership, and configuration
2. Course authoring, translation, versioning, and publishing

These workloads are centrally managed and do not require one database per tenant.

## Decision

Use separate Cloudflare D1 databases:

```text
nvi-control
nvi-content
```

### `nvi-control`

Stores platform-level data such as:

- Better Auth tables
- Users
- Sessions
- Workspaces
- Workspace memberships
- Invitations
- Roles
- Permissions
- Workspace registry
- User preferences
- Platform configuration
- Audit metadata

### `nvi-content`

Stores course-authoring data such as:

- Courses
- Modules
- Pages
- Content blocks
- Canonical content
- Translations
- Localizations
- Versions
- Reviews
- Approvals
- Publishing records
- Media references

## Rationale

Keeping control and content separate:

- Reduces coupling
- Allows independent schema evolution
- Keeps authentication workload separate from CMS workload
- Improves conceptual clarity
- Simplifies backup and migration strategies

## ORM

Use **Drizzle ORM** for schema definitions and migrations unless a simpler direct-SQL approach is clearly preferable for a specific operation.

## Consequences

The Learning PWA does not query `nvi-content` directly for routine course presentation.

Published content is exported from the CMS into versioned JSON/media packages distributed through Cloudflare storage/CDN.
