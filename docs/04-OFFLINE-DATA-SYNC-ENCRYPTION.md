# Offline Data, IDs, Sync, Encryption and Recovery

## Local-first

Normal operations succeed against IndexedDB without network. A sync
process later pushes/pulls changes.

Use IndexedDB for structured operational data and metadata/references.
Use Cache Storage for large/static course media.

## IDs: UUIDv7 + server sequence

Offline clients must create IDs without a server. Prefer **UUIDv7**
(ULID is an alternative) over UUIDv4 or central auto-increment because
it is globally unique and time-sortable/index-friendly.

Do **not** use a server auto-increment integer as distributed record
identity.

Separately, the server may maintain a monotonically increasing **sync
sequence/change cursor**.

-   UUIDv7 = record identity
-   sync sequence = incrementing change position
    (`what changed after N?`)

This is the intended "indexable/incrementing" combination.

## Common sync metadata

``` text
id (UUIDv7)
workspace_id
record_type
created_at
updated_at
deleted_at (tombstone)
version
device_id
created_by / updated_by where appropriate
```

Initial sync: local-first writes, idempotent upserts, retries,
tombstones, pull after last sync sequence, optimistic conflict
detection. Latest-modification policy may be acceptable initially in
low-conflict areas, while preserving metadata for better resolution
later. `SyncStatus` is primarily local state.

## Clear envelope + encrypted payload

Cloud sync should leave only necessary routing/order/auth metadata clear
and encrypt sensitive/core data on device.

``` json
{
  "id": "uuidv7",
  "workspace_id": "uuid",
  "record_type": "inventory_transaction",
  "created_at": "...",
  "updated_at": "...",
  "deleted_at": null,
  "version": 4,
  "sync_sequence": 123456,
  "device_id": "...",
  "encrypted_payload": "..."
}
```

Minimize the envelope: clear metadata leaks counts/timing/types.
Amounts, descriptions, product/account details, notes and other
sensitive business data normally belong in ciphertext.

Tradeoff: server-side search/reporting over encrypted fields is
unavailable unless fields are deliberately exposed or advanced
searchable encryption is adopted. Client-side reporting from IndexedDB
fits the offline-first design.

## Keys/recovery

A production design needs workspace data keys plus a secure way for
authorized devices/users to unlock/receive them. Cloud storage should
not need plaintext workspace data keys if provider-inaccessible
encryption is the goal.

Previously discussed recovery options: trusted existing device, trusted
workspace member, QR/device transfer, recovery secret/key, or more
advanced threshold/recovery shares.

Account recovery ≠ data-key recovery. If the only key is on a lost
device, immediate data recovery is impossible. Do not lock in crypto/key
recovery until deliberately designed/threat-modeled.

## Residency

Encryption does not necessarily remove residency obligations. Preserve
residency-aware routing.

## API boundary

Long-term: `PWA → authenticated Sync API → workspace routing/storage`

Benefits: provider portability, residency routing, central
authorization/protocol evolution, and ability to use different
providers. Direct Supabase access can accelerate an MVP but should not
become inseparable from domain design.
