# ADR 0005: Use One SQLite-Backed Durable Object per Workspace

**Status:** Proposed / Preferred  
**Date:** 2026-10-20

## Context

New Vines operational applications such as Inventory and Finance require multi-tenant storage.

A shared multi-tenant database would require every business query to correctly include a workspace filter. A missing filter could potentially expose data across tenants.

A separate D1 database per workspace offers strong isolation but creates operational complexity around dynamic Worker bindings and large numbers of databases.

Cloudflare Durable Objects provide a natural routing mechanism and can maintain private SQLite storage per object.

## Decision

Use **one SQLite-backed Durable Object per workspace** as the preferred tenant data architecture.

Conceptually:

```text
workspace:<workspace UUID>
       ↓
Durable Object
       ↓
Private SQLite database
```

Each workspace SQLite database may contain:

- Financial accounts
- Transactions
- Categories
- Budgets
- Inventory items
- Inventory movements
- Customers
- Vendors
- Attachment references
- Sync metadata
- Future workspace-specific application tables

## Routing

Clients send only a logical `workspaceId`.

The Worker API:

1. Authenticates the user
2. Verifies workspace membership
3. Verifies permission
4. Resolves the workspace Durable Object
5. Executes the operation against that workspace's SQLite database

Clients must never select databases directly.

## Rationale

This design provides:

- Strong tenant isolation
- Simple deterministic routing
- No requirement for thousands of Worker D1 bindings
- SQLite semantics
- Independent per-workspace migrations
- Reduced blast radius from query mistakes

## Security Benefit

A query such as:

```sql
SELECT * FROM Transaction;
```

returns only data from the current workspace database.

This provides defense in depth compared with a shared table requiring:

```sql
WHERE workspace_id = ?;
```

on every query.

## Consequences

Workspace databases require:

- Schema version tracking
- Per-workspace migration logic
- Backup/export strategy
- Monitoring and operational tooling
- Careful Durable Object lifecycle management

## Open Questions

Validate before production:

- Cost profile at expected scale
- Migration performance across many workspaces
- Backup and restore workflow
- Analytics/reporting across workspaces
- Geographic/data-residency implications
