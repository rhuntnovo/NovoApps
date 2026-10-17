# NovoApps --- Multi-App Platform

## Vision

Offline-first, multilingual, low-bandwidth PWAs: - Learning -
Inventory - Finance / Money Management

Designed for individuals, households, microbusinesses, growing
businesses, groups and program participants.

## Workspace

Use `workspace` as universal ownership/partition term, not
tenant/company/organization. A workspace may represent an individual,
household, business or group; a user may join multiple workspaces.
Membership/roles are separate. Capabilities can be enabled rather than
forcing rigid workspace types.

## Shared client foundation

Preferred: Vite, Preact, TypeScript, IndexedDB (Dexie is reasonable),
service worker/Cache Storage, external i18n, periodic synchronization.
Keep dependencies light.

Potential shared areas: auth, onboarding, workspaces, local-db, sync,
crypto, i18n, storage, versioning. Extract shared packages only after
multiple apps genuinely need the same implementation.

## Authentication

Previously favored with Supabase: separate real-person identities
(including husband/wife), workspace memberships/roles, simple email OTP
and optional TOTP MFA, public/publishable client config only,
authenticated token for authorized sync/API.

Authentication and encryption-key recovery are separate problems.

## Storage classes

Public education: course JSON/images/SVG/audio/video/docs → CDN/object
storage such as R2 + PWA Cache Storage.

Operational data: products/inventory
transactions/finance/budgets/settings → IndexedDB first, synchronized
later.

User-generated private files: prior preference was Supabase private
workspace/user storage if Supabase remains; compress/optimize photos
client-side.

## Residency-aware architecture

``` text
PWA → Authenticated Sync API → workspace/residency router → approved provider/region
```

Do not assume encryption automatically satisfies transfer/residency law.

Prior build-version convention: `YYYYMMDD.N`; Git milestone tags and
course versions are separate concepts.
