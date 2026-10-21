# ADR 0007: Use an Offline-First Synchronization Model

**Status:** Accepted  
**Date:** 2026-10-20

## Context

New Vines operational PWAs may be used in environments with:

- Intermittent internet
- Expensive mobile data
- Long offline periods
- Low-end phones and tablets

Applications must remain usable without network connectivity.

## Decision

Use **IndexedDB as the local operational database** and synchronize through a purpose-built Hono API.

The client must never communicate directly with D1 or workspace Durable Object SQLite.

## Synchronization Flow

```text
Preact PWA
   ↓
IndexedDB
   ↓
Batch sync request
   ↓
Hono Worker API
   ↓
Authentication
   ↓
Workspace authorization
   ↓
Workspace Durable Object
   ↓
SQLite
```

## Record Metadata

A typical record may include:

```text
id
createdAt
updatedAt
deletedAt
version
syncState
payload
```

Where end-to-end encryption is enabled, metadata required for synchronization may remain readable while business payload data is encrypted.

## Sync Requirements

The protocol must support:

- Create
- Update
- Delete/tombstone
- Incremental downloads
- Batch upload
- Idempotent retry
- Conflict detection
- Conflict resolution
- Device reconnect after long offline periods
- Schema/version compatibility

## API Design

Prefer one batch sync operation over hundreds of per-record HTTP calls.

Example:

```http
POST /api/v1/workspaces/{workspaceId}/sync
```

The server authenticates and authorizes once for the request.

## Rationale

This design minimizes:

- Network overhead
- Battery usage
- Latency sensitivity
- Server round trips

while preserving a responsive local-first user experience.

## Consequences

The sync protocol becomes a core platform contract and must be:

- Versioned
- Tested carefully
- Backward-compatible where feasible
- Documented separately in `docs/SYNC_PROTOCOL.md`
