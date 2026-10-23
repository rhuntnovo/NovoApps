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

## Current direction (October 20, 2026)

NEW_VINES_PLATFORM_ARCHITECTURE.md and ADR 0001–0008 are the current platform context.
Keep this document's earlier Supabase preferences as background rather than the selected stack.
D1 control/content separation is accepted. Better Auth and workspace SQLite Durable Objects
are preferred proposals to validate before production. R2 remains the target for assets and
published packages. Hono/Drizzle/Zod are used in the new local CMS pilot; field PWAs stay Preact.

The root now has npm workspaces for new apps/services/packages; the deployed Learning
app stays in newvines-learning with an independent package/lockfile. React administration
and a separate Preact renderer iframe are deliberately isolated. The first CMS is local-only;
see docs/09 and ADR 0008. No control database, user registration or workspace sync is deployed.

## Provider authoring and Spanish review update (2026-10-21)

The user's next priority is authoring the remaining English Foundations modules,
explicit AI translation to Spanish/Nicaragua, and human comparison/editing/review.
The local implementation is in docs/10 and ADR 0012. Module/page/block/narration
creation, provider-scoped editions, write-only translation settings, source revision
tracking and shared content-runtime are implemented. No cloud publication or hosted
reviewer access was added. The earlier direct Learning-source preview shortcut is
superseded; historical pilot ADR 0008 has been renumbered 0011.

Before remote reviewer access: implement platform-web, validated identity/control D1,
provider permissions and audit attribution. Then controlled approval/assets/audio and
immutable publication/catalog support. Existing v0.8.3 publication remains unchanged.