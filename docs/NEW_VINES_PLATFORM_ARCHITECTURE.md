# New Vines Platform Architecture

**Document status:** Proposed target architecture  
**Last updated:** 2026-10-20  
**Purpose:** Canonical technical architecture for the New Vines digital platform and a reference for developers and Codex working in the repository.

---

## 1. Executive Summary

The New Vines platform should use a **Cloudflare-native, offline-first architecture** with a clear separation between:

1. **Identity and platform control**
2. **Course authoring and publishing**
3. **Workspace-specific operational data**
4. **Lightweight end-user PWAs**
5. **Media and published learning resources**

The recommended design is:

- **Preact + TypeScript** for end-user PWAs such as Learning, Finance/Budgeting, and Inventory.
- **React + TypeScript** where useful for administrative applications such as registration, account management, and the Course Content Management System (CMS), primarily to take advantage of mature open-source React components and utilities.
- **Cloudflare Workers** as the API/application layer.
- **Hono** as the Worker API framework.
- **Better Auth** as the authentication and identity system.
- **Better Auth UI and/or shadcn/ui** for reusable React authentication/account-management interfaces.
- **Cloudflare D1** for central platform/control data.
- **Cloudflare D1** for CMS/course-authoring data.
- **SQLite-backed Durable Objects** for isolated per-workspace operational databases.
- **Cloudflare R2** for media, attachments, published course JSON, audio, images, and other binary assets.
- **Drizzle ORM** for central D1 schemas and migrations.
- **Zod** for shared validation and API contracts.
- **IndexedDB** for offline PWA operational storage.
- A purpose-built synchronization API for PWA data rather than direct database access.

The core architectural principle is:

> **Authenticate centrally, authorize centrally, route securely by workspace, and keep each workspace's operational data physically isolated in its own SQLite database.**

---

# 2. Primary Design Goals

The architecture should support the following requirements.

## 2.1 Lightweight and offline-first

The end-user applications must perform well on:

- Low-cost Android phones and tablets
- Older devices
- Intermittent or expensive internet connections
- Rural environments
- Devices that may remain offline for extended periods

The PWA should continue functioning from local data when connectivity is unavailable.

## 2.2 International and multilingual

The platform must support:

- Multiple languages
- Country-specific localization
- Local currency
- Country-specific content where appropriate
- Translation review and publishing workflows
- Expansion to additional countries without redesigning the platform

## 2.3 Strong tenant isolation

A defect in a query should not expose one organization's financial or operational data to another organization.

Workspace-specific data should therefore be isolated at the database level whenever practical.

## 2.4 Simple user experience

Users should not need to understand:

- Databases
- Tenancy
- Synchronization
- Cloud storage
- Authentication tokens
- Encryption keys

The applications should present simple concepts such as:

- My account
- My organization/workspace
- My household/business
- My courses
- Sync

## 2.5 Scalable without premature complexity

The system should work well for:

- Pilot deployments with tens of users
- Hundreds of users
- Thousands of alumni
- Thousands of separate workspaces

The architecture should not require a major rewrite when usage grows.

## 2.6 Secure by design

Security should be enforced by the server-side routing and authorization model rather than depending only on client behavior.

---

# 3. High-Level Architecture

```text
                           NEW VINES PLATFORM

 ┌─────────────────────────────────────────────────────────────┐
 │                       CLIENT APPLICATIONS                    │
 │                                                             │
 │  Preact PWAs                      React Admin Applications   │
 │  ───────────                      ─────────────────────────   │
 │  Learning                        Registration               │
 │  Inventory                       Account Management         │
 │  Finance / Budgeting             Course CMS                 │
 │  Future field apps               Platform Administration   │
 └──────────────────────────┬──────────────────────────────────┘
                            │ HTTPS / JSON
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                  CLOUDFLARE WORKER API LAYER                 │
 │                                                             │
 │  Hono                                                       │
 │  Authentication middleware                                  │
 │  Authorization                                              │
 │  Input validation                                           │
 │  Workspace routing                                          │
 │  Business services                                          │
 │  Synchronization API                                        │
 │  Rate limiting / logging                                    │
 └───────────────┬───────────────────┬─────────────────────────┘
                 │                   │
                 ▼                   ▼
 ┌─────────────────────────┐   ┌───────────────────────────────┐
 │ CENTRAL CONTROL D1      │   │ CMS / CONTENT D1              │
 │                         │   │                               │
 │ Users                   │   │ Courses                       │
 │ Sessions                │   │ Modules                       │
 │ Accounts                │   │ Pages                         │
 │ Verification            │   │ Blocks                        │
 │ Workspaces              │   │ Translations                  │
 │ Memberships             │   │ Localizations                 │
 │ Roles                   │   │ Versions                      │
 │ Invitations             │   │ Review / approval state       │
 │ Workspace registry      │   │ Publishing history            │
 └───────────────┬─────────┘   └──────────────┬────────────────┘
                 │                            │
                 │                            │ Publish
                 │                            ▼
                 │                  ┌───────────────────────────┐
                 │                  │ Cloudflare R2 / CDN        │
                 │                  │ Published JSON             │
                 │                  │ Images                     │
                 │                  │ Audio                      │
                 │                  │ Video                      │
                 │                  │ Documents                  │
                 │                  └───────────────────────────┘
                 │
                 ▼
 ┌─────────────────────────────────────────────────────────────┐
 │              WORKSPACE DURABLE OBJECT NAMESPACE              │
 │                                                             │
 │ Workspace A        Workspace B         Workspace C           │
 │ ┌────────────┐    ┌────────────┐      ┌────────────┐         │
 │ │ SQLite DB  │    │ SQLite DB  │      │ SQLite DB  │         │
 │ └────────────┘    └────────────┘      └────────────┘         │
 │                                                             │
 │ Inventory / Finance / Contacts / Sync metadata / etc.       │
 └─────────────────────────────────────────────────────────────┘
```

---

# 4. Front-End Framework Strategy

## 4.1 Preact remains the standard for end-user PWAs

New Vines end-user applications should continue using:

- **Preact**
- **TypeScript**
- **Vite**
- Service worker / PWA capabilities
- IndexedDB for structured offline data
- Cache Storage for large static resources where appropriate

This includes:

- New Vines Learning
- Personal/business Finance
- Inventory
- Future field applications

Reasons for retaining Preact:

- Very small runtime
- Fast loading on low-end devices
- Excellent fit for offline-first PWAs
- Existing New Vines codebase already uses Preact
- React-like programming model
- Good TypeScript support
- Avoids adding unnecessary client weight

### Important rule

Do **not** convert the existing Learning PWA to React simply because React is used elsewhere in the platform.

---

## 4.2 React can be used for administrative web applications

React is recommended for applications where:

- Bundle size is less critical
- Users are more likely to be on a laptop or modern device
- Rich editing controls are required
- Existing open-source React components can materially reduce development time

Likely React applications include:

- Registration portal
- Account/profile management
- Workspace administration
- User invitation management
- Course CMS
- Translation/review interface
- Platform administration

This allows New Vines to benefit from the React ecosystem without burdening every field PWA with React.

---

# 5. Open-Source Components and Utilities

## 5.1 Better Auth

**Purpose:** Central authentication and identity management.

Better Auth should be evaluated as the primary authentication framework.

Responsibilities may include:

- User registration
- Login
- Logout
- Password reset
- Email verification
- Session management
- Account management
- Organization/workspace membership
- Invitations
- Roles
- Teams where useful
- Optional MFA/passkey support as the platform matures

### Architectural principle

Better Auth manages **identity**.

The New Vines authorization layer still determines whether a user may access a particular workspace and perform a particular business operation.

---

## 5.2 Better Auth UI

**Purpose:** Reusable account-management and authentication UI.

Better Auth UI can be used in the React administrative applications to accelerate development of:

- Sign-in
- Sign-up
- Forgot password
- Account profile
- Authentication settings
- Other standard identity screens

It should be treated as a starting point, not as the permanent visual design.

New Vines should retain control of:

- Branding
- Simplicity
- Accessibility
- Localization
- Mobile usability

### Preact note

The Preact PWAs do **not** need to depend on Better Auth UI.

They can use lightweight custom Preact screens that communicate with the same Better Auth-backed server endpoints.

This preserves the small PWA footprint.

---

## 5.3 shadcn/ui

Recommended primarily for:

- CMS
- Admin portal
- Registration/account application

Useful building blocks include:

- Dialogs
- Forms
- Tabs
- Data tables
- Menus
- Command palettes
- Sheet/drawer controls
- Accessible primitives

Because shadcn components become part of our source code, they can be simplified and branded rather than functioning as a black-box UI dependency.

---

## 5.4 Hono

**Purpose:** Cloudflare Worker API framework.

Hono should be the primary API/application framework.

Responsibilities:

- Route definitions
- Middleware
- Authentication enforcement
- Authorization
- Request validation
- REST/business endpoints
- Sync endpoints
- API versioning
- Error handling
- Logging
- OpenAPI generation where appropriate

Example API structure:

```text
/api/v1/auth/*
/api/v1/me
/api/v1/workspaces
/api/v1/workspaces/:workspaceId
/api/v1/workspaces/:workspaceId/sync
/api/v1/workspaces/:workspaceId/inventory/*
/api/v1/workspaces/:workspaceId/finance/*
/api/v1/cms/*
/api/v1/publishing/*
```

---

## 5.5 Zod

**Purpose:** Runtime validation and common data contracts.

Zod should be used for:

- API inputs
- API outputs
- Synchronization payloads
- CMS content validation
- Published JSON validation
- Configuration validation

Where practical, the same schema should drive:

- TypeScript inference
- Runtime validation
- API documentation
- Tests

---

## 5.6 Drizzle ORM

**Primary use:** Central D1 databases.

Recommended for:

- Schema definitions
- Migrations
- Typed queries
- Central control database
- CMS database

For workspace Durable Object SQLite, direct parameterized SQL may be simpler and more efficient for high-volume synchronization operations.

The project should not adopt an ORM merely for consistency if direct SQLite access is clearer.

---

# 6. Central Control Database

Recommended database:

```text
nvi-control
```

Technology:

```text
Cloudflare D1 / SQLite
```

The central database is the authoritative source for platform-level identity and access relationships.

Potential tables:

```text
user
account
session
verification

workspace
workspace_member
workspace_invitation
workspace_role
workspace_permission

workspace_registry

user_preference
device_registration

platform_setting
audit_event
```

Better Auth may own or generate some authentication tables.

New Vines-specific tables should reference authentication identities rather than duplicating identity data.

---

# 7. Workspace Model

A **workspace** is the primary tenant boundary.

Examples:

- Individual household
- Married couple/household
- Small business
- Savings group
- Ministry
- Training organization

A user may belong to more than one workspace.

Example:

```text
User: Maria

Memberships:
    Martinez Household       Owner
    Martinez Grocery         Administrator
    Church Savings Group     Member
```

---

# 8. Workspace Authorization

Every workspace request should follow this sequence:

```text
1. Receive authenticated API request
2. Resolve authenticated user
3. Read requested workspaceId
4. Verify active workspace membership
5. Verify role/permission
6. Obtain server-side workspace Durable Object
7. Execute the operation
8. Return authorized result
```

The client must never provide:

- A database connection string
- Database credentials
- A D1 database identifier
- A Durable Object identifier that bypasses server routing

The client provides only the logical:

```text
workspaceId
```

The server performs secure routing.

---

# 9. Per-Workspace SQLite Architecture

## 9.1 Recommended approach

Use one SQLite-backed Durable Object per workspace.

Conceptually:

```text
workspace:<UUID>
      │
      ▼
Durable Object
      │
      ▼
Private SQLite database
```

Example:

```text
workspace:42c5...
 ├── Account
 ├── Category
 ├── Transaction
 ├── Budget
 ├── InventoryItem
 ├── InventoryTransaction
 ├── Customer
 ├── Vendor
 ├── AttachmentReference
 └── SyncMetadata
```

Another workspace receives a separate SQLite database.

---

## 9.2 Why database-per-workspace is desirable

This provides strong isolation.

A query such as:

```sql
SELECT * FROM Transaction;
```

can only return data from the selected workspace database.

In a conventional shared multi-tenant table, the equivalent query could accidentally expose every tenant if the developer forgot:

```sql
WHERE workspace_id = ?;
```

Database-level separation therefore provides significant defense in depth.

---

## 9.3 Workspace IDs remain global identifiers

The platform should use UUID/GUID identifiers.

A workspace ID should be globally unique.

Example:

```text
71fea1bb-0acf-4f8e-8f24-...
```

The Durable Object namespace can deterministically map this logical ID to the workspace object.

---

# 10. Workspace Database Versioning

Every workspace database should record a schema version.

Example:

```text
SystemMetadata
--------------
SchemaVersion
CreatedUtc
LastMigrationUtc
```

When a Durable Object opens a workspace database, the application can:

1. Read the schema version.
2. Run required migrations transactionally.
3. Update the version.
4. Continue processing the request.

Workspace database migrations must be:

- Repeatable where possible
- Tested
- Forward-only in production unless a rollback strategy is explicitly defined
- Safe to execute independently per workspace

---

# 11. Offline PWA Storage

The PWA remains offline-first.

Recommended client storage:

```text
IndexedDB
```

Possible local records:

```text
id
createdAt
updatedAt
deletedAt
syncState
version
encryptedPayload
```

Where end-to-end encryption is enabled, operational metadata needed for synchronization may remain readable while the sensitive business payload remains encrypted.

---

# 12. Synchronization Architecture

The PWA must never synchronize directly with D1 or Durable Object storage.

All synchronization goes through the Worker API.

Example:

```http
POST /api/v1/workspaces/{workspaceId}/sync
Authorization: Bearer <session-or-access-token>
```

Conceptual request:

```json
{
  "deviceId": "uuid",
  "lastServerCursor": "opaque-cursor",
  "changes": [
    {
      "entity": "transaction",
      "id": "uuid",
      "updatedAt": "2026-10-20T12:00:00Z",
      "operation": "upsert",
      "payload": {}
    }
  ]
}
```

Conceptual response:

```json
{
  "serverCursor": "opaque-next-cursor",
  "accepted": [],
  "conflicts": [],
  "serverChanges": []
}
```

The synchronization protocol should support:

- Create
- Update
- Delete/tombstone
- Conflict detection
- Incremental downloads
- Idempotent retry
- Device reconnect after long offline periods

---

# 13. Authentication and Synchronization

Authentication should be centralized.

The client should not maintain independent credentials for each workspace database.

Instead:

```text
User login
   ↓
Central authentication
   ↓
Session/token
   ↓
API request includes workspaceId
   ↓
Central membership authorization
   ↓
Server routes request to workspace SQLite
```

This produces a clean distinction between:

```text
Identity:
Who are you?

Authorization:
Which workspaces can you access?

Permission:
What may you do there?

Routing:
Which isolated SQLite database handles the operation?
```

---

# 14. Token and Session Strategy

The exact Better Auth session/token mechanism should be selected during implementation, but the API design should avoid:

- Re-authentication on every individual record
- Database credentials on the device
- Long-lived unrestricted bearer credentials
- Embedding tenant database details in tokens

For synchronization efficiency, the server should authenticate once per sync request and then authorize the workspace operation.

A batch synchronization request is preferred over hundreds of per-record HTTP calls.

---

# 15. Course CMS Architecture

The CMS should be treated separately from workspace operational applications.

Recommended database:

```text
nvi-content
```

Technology:

```text
Cloudflare D1
```

The CMS is the authoritative authoring environment.

The Learning PWA is the authoritative presentation/runtime environment.

---

# 16. Course Content Model

Maintain the established hierarchy:

```text
Course
  └── Module
       └── Page
            └── ContentBlock
```

Potential content entities:

```text
Course
CourseVersion

Module
ModuleVersion

Page
PageVersion

ContentBlock
BlockVersion

Translation
Localization

MediaAsset

Review
Approval
Publication
```

Existing content block concepts should continue to support page templates such as:

- Title
- Teaching
- Scripture
- Concepts
- Steps
- Question
- Exercise
- Prayer

---

# 17. Canonical Content and Translation Model

New Vines canonical course wording must remain protected.

The system should distinguish between:

```text
Canonical source content
Translation
Localization
Presentation
```

These are not the same thing.

Example:

```text
Canonical language:
en-global

Available localized translations:
es-ni
fr-ci
sw-ke
sw-tz
```

A translation record should reference its canonical source record.

Potential fields:

```text
Translation
-----------
id
sourceContentId
languageCode
localeCode
translatedText
status
translatorUserId
reviewerUserId
createdAt
updatedAt
approvedAt
sourceVersion
```

---

# 18. Translation Workflow

Recommended states:

```text
Needs Translation
      ↓
Draft
      ↓
Translation Review
      ↓
Content Review
      ↓
Approved
      ↓
Published
```

If canonical content changes after a translation is created, the CMS should be able to mark the translation:

```text
Needs Review
```

rather than silently considering the old translation current.

---

# 19. CMS Multi-User Editing

The CMS should support multiple editors and translators.

Recommended controls include:

- User roles
- Course-level permissions
- Locale/language permissions
- Edit history
- Version history
- Review state
- Approval state
- Publishing permissions
- Optimistic concurrency/version checks

For initial implementation, full Google-Docs-style simultaneous character editing is unnecessary.

Record/version-level concurrency is sufficient.

---

# 20. Content Publishing

The Learning PWA should **not** query the CMS database to render ordinary course pages.

Instead:

```text
CMS
 ↓
Validate
 ↓
Build canonical course package
 ↓
Version package
 ↓
Publish JSON/media
 ↓
R2 / CDN
 ↓
Learning PWA
 ↓
Cache offline
```

This keeps the learner experience:

- Fast
- Reliable
- Low-bandwidth
- Offline capable
- Independent of CMS availability

---

# 21. Published Course Files

The existing JSON strategy should continue.

Example:

```text
nvi-fgmm-m01.en-global.json
nvi-fgmm-m01.es-ni.json
```

Potential future package hierarchy:

```text
courses/
  fgmm/
    1.0.0/
      en-global/
        manifest.json
        module-01.json
        module-02.json
      es-ni/
        manifest.json
        module-01.json
        module-02.json
```

The exact physical naming convention can evolve without changing the underlying course content model.

---

# 22. Media and File Storage

Use **Cloudflare R2** for large or binary content.

Examples:

```text
course images
illustrations
narration audio
video
PDF resources
workbooks
workspace attachments
user photos
backup/export packages
published JSON
```

Do not store large binary objects directly in D1 or workspace SQLite unless there is a specific technical reason.

Database records should store:

```text
assetId
objectKey
contentType
size
hash
createdAt
```

---

# 23. Learning PWA Offline Media

The Learning PWA may cache:

- JSON
- Images
- Audio
- Video where practical
- Documents

using browser Cache Storage or equivalent browser-managed storage.

IndexedDB can store:

- Course metadata
- Cache references
- Download state
- Progress
- User state

Large files should generally not be duplicated inside IndexedDB if Cache Storage is appropriate.

---

# 24. Encryption

Workspace-level encryption remains an optional architecture capability.

A possible encrypted record format is:

```text
id             clear
createdAt      clear
updatedAt      clear
syncState      clear
version        clear
encryptedData  encrypted
```

This allows synchronization to identify records without decrypting business data.

If end-to-end encryption is implemented, key recovery must be designed before deployment because encryption affects:

- New-device recovery
- Password reset
- Shared workspaces
- Multiple devices
- Backup restore
- Administrative support

Encryption must therefore be implemented as a deliberate platform feature, not simply as a field-level coding change.

---

# 25. Country and Data Residency

The platform should preserve the ability to apply workspace-level policy such as:

```text
workspace
 ├── residencyPolicy
 ├── region
 ├── encryptionPolicy
 ├── synchronizationPolicy
 └── retentionPolicy
```

Country-specific legal requirements must be assessed independently.

The architecture should not assume that encryption alone eliminates data residency obligations.

---

# 26. API Philosophy

New Vines should **not** expose raw database CRUD APIs directly to PWAs.

Prefer business APIs.

Instead of:

```text
POST /table/Transaction
PATCH /table/Inventory
DELETE /table/Account
```

prefer:

```text
POST /workspaces/:id/sync
POST /workspaces/:id/inventory/purchases
POST /workspaces/:id/inventory/sales
POST /workspaces/:id/finance/transactions
GET  /workspaces/:id/finance/budget-summary
```

This ensures the API layer consistently enforces:

- Authentication
- Authorization
- Business rules
- Validation
- Auditing
- Version compatibility
- Workspace isolation

---

# 27. API Contracts

API requests and responses should use shared TypeScript-compatible contracts.

Preferred tools:

```text
Zod
Hono
TypeScript
OpenAPI where useful
```

Example:

```ts
const TransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  transactionDate: z.string(),
  amount: z.number(),
  updatedAt: z.string()
});
```

The objective is to minimize duplicated definitions between:

- API validation
- TypeScript types
- Documentation
- Tests

---

# 28. Suggested Repository Structure

A monorepo is recommended.

Example:

```text
newvines-platform/
│
├── apps/
│   ├── learning-pwa/           # Preact
│   ├── inventory-pwa/          # Preact
│   ├── finance-pwa/            # Preact
│   │
│   ├── account-web/            # React
│   ├── cms-web/                # React
│   └── admin-web/              # React
│
├── services/
│   └── api-worker/             # Hono / Cloudflare Workers
│
├── packages/
│   ├── contracts/              # Zod/API schemas
│   ├── content-model/          # Course JSON types/schema
│   ├── sync-protocol/
│   ├── auth/
│   ├── localization/
│   ├── ui-tokens/
│   └── utilities/
│
├── database/
│   ├── control/
│   │   ├── schema/
│   │   └── migrations/
│   │
│   ├── content/
│   │   ├── schema/
│   │   └── migrations/
│   │
│   └── workspace/
│       ├── schema/
│       └── migrations/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONTENT_MODEL.md
│   ├── SYNC_PROTOCOL.md
│   ├── SECURITY.md
│   └── ADR/
│
└── tooling/
```

---

# 29. Shared Code Between React and Preact

Do not attempt to share every UI component.

Prefer sharing:

```text
TypeScript types
Zod schemas
API client
authentication client helpers
localization resources
formatters
business rules
content model
sync protocol
design tokens
```

Framework-specific UI should normally remain within each application.

This reduces coupling between React administration applications and Preact PWAs.

---

# 30. Authentication UI by Application Type

## React admin/CMS applications

May use:

```text
Better Auth UI
shadcn/ui
React Hook Form or equivalent
```

## Preact PWAs

Use lightweight custom Preact interfaces.

The PWA should call the same authentication platform but does not need to ship React UI libraries merely to provide login.

Example:

```text
Preact Login Form
       ↓
Better Auth-backed endpoint
       ↓
Session established
       ↓
PWA calls Hono API
```

---

# 31. Invitations

The platform should support email invitation flows.

Typical workflow:

```text
Workspace owner
      ↓
Invite user by email
      ↓
Central invitation record
      ↓
Email sent
      ↓
Recipient follows invitation link
      ↓
Sign in / create account
      ↓
Invitation validated
      ↓
Membership created
      ↓
Workspace appears in user's account
```

Invitation acceptance must be performed server-side and should never rely only on workspace IDs present in a URL.

---

# 32. Roles and Permissions

Start with a small number of understandable roles.

Example:

```text
Owner
Administrator
Editor
Member
Viewer
```

Application-specific permissions can later be layered underneath roles.

Example:

```text
inventory.read
inventory.write
finance.read
finance.write
workspace.invite
workspace.manage_members
content.edit
content.review
content.publish
```

Avoid creating a highly granular permission system before actual requirements justify it.

---

# 33. Audit Logging

Important administrative operations should create audit events.

Examples:

- Workspace created
- User invited
- Membership accepted
- Role changed
- Member removed
- Content approved
- Content published
- Course version changed
- Workspace data export initiated
- Administrative access performed

Audit logging should avoid storing unnecessary sensitive payload data.

---

# 34. Observability

The Worker/API layer should provide structured logs containing appropriate identifiers such as:

```text
requestId
userId
workspaceId
route
duration
status
applicationVersion
```

Do not log:

- Passwords
- Authentication secrets
- Encryption keys
- Sensitive decrypted financial payloads

---

# 35. Backups and Exports

The architecture should support user-controlled exports.

Possible formats:

- JSON gzip
- CSV gzip
- Excel where useful

This aligns with the existing Inventory PWA approach.

Workspace backup and platform disaster recovery are separate concerns and should not be confused.

---

# 36. Separation of Concerns

The architecture intentionally separates five concerns.

## Identity

```text
Who is the user?
```

## Authorization

```text
Which workspaces and platform features may the user access?
```

## Tenant routing

```text
Which isolated workspace storage handles this request?
```

## Operational data

```text
What financial/inventory/business information belongs to this workspace?
```

## Educational content

```text
What approved course/version/language should be delivered?
```

Maintaining these boundaries should be considered a core architectural requirement.

---

# 37. Technology Decision Summary

| Concern | Recommended technology |
|---|---|
| End-user PWAs | **Preact + TypeScript + Vite** |
| CMS/Admin UI | **React + TypeScript** |
| Admin UI components | **shadcn/ui** |
| Auth UI accelerator | **Better Auth UI** |
| Authentication | **Better Auth** |
| API | **Hono** |
| API validation | **Zod** |
| Central control DB | **Cloudflare D1** |
| CMS DB | **Cloudflare D1** |
| Central DB ORM | **Drizzle** |
| Tenant/workspace DB | **SQLite-backed Durable Object** |
| File/media storage | **Cloudflare R2** |
| Local PWA DB | **IndexedDB** |
| Offline assets | **Cache Storage / PWA cache** |
| Course distribution | **Versioned JSON + R2/CDN** |
| Sync | **Purpose-built Hono sync API** |
| Hosting | **Cloudflare Workers / Static Assets** |

---

# 38. Technologies Not Chosen as the Primary Platform

## Supabase

Supabase remains a strong alternative and provides excellent:

- PostgreSQL
- Authentication
- Row-Level Security
- Storage
- Realtime
- Generated APIs

However, the Cloudflare-native architecture is preferred if it proves practical because it provides:

- Natural integration with the existing Cloudflare-hosted New Vines applications
- Strong database-per-workspace isolation
- Lightweight edge APIs
- SQLite throughout most of the platform
- Fewer major infrastructure providers
- A good fit for the offline-first synchronization model

This decision should be revisited if Cloudflare's architecture materially complicates authentication, recovery, compliance, analytics, or operational support.

---

# 39. Architectural Guardrails

Developers and Codex should follow these rules unless an explicit architecture decision record changes them:

1. **Do not replace Preact in the end-user PWAs with React without an explicit decision.**
2. Do not allow PWA clients direct access to workspace databases.
3. Do not trust a workspace ID merely because the client supplied it.
4. Always authenticate and authorize before workspace routing.
5. Keep workspace operational data isolated by workspace.
6. Do not put large media files in D1 or SQLite unnecessarily.
7. Do not make the Learning PWA dependent on live CMS queries for normal course presentation.
8. Preserve canonical New Vines course wording.
9. Treat translation and localization as distinct from canonical content.
10. All synchronization changes must be idempotent or safely retryable.
11. Use parameterized SQL.
12. Validate API inputs at the server boundary.
13. Do not log secrets or decrypted sensitive payloads.
14. Prefer simple systems over abstraction for abstraction's sake.
15. Keep offline operation as a first-class requirement.

---

# 40. Recommended Implementation Sequence

The platform should be built incrementally.

### Phase 1 — Foundation

```text
Monorepo
Shared contracts
Cloudflare environments
Control D1
Hono API
Better Auth
Basic registration/login
Workspace creation
Workspace invitation
```

### Phase 2 — Workspace Infrastructure

```text
Durable Object workspace routing
Workspace SQLite schema
Workspace migration framework
Authorization middleware
Basic test workspace API
```

### Phase 3 — Synchronization

```text
Sync protocol specification
IndexedDB client sync engine
Incremental server sync
Conflict handling
Retry/idempotency
Offline tests
```

### Phase 4 — Finance / Inventory Integration

Move or adapt the existing PWA business features onto the common platform foundation.

### Phase 5 — Course CMS

```text
Content D1
React CMS
Course/module/page/block editing
Translation workflow
Versioning
Review/approval
Publishing
```

### Phase 6 — Learning Publishing Integration

Connect the CMS publishing process to the existing Preact Learning PWA JSON format.

### Phase 7 — Advanced Platform Features

Potential additions:

```text
MFA/passkeys
End-to-end workspace encryption
Advanced audit tools
Country-specific residency controls
Trainer certification
AI-assisted translation/review
AI-assisted content quality checks
Analytics
```

---

# 41. Architectural Questions Still to Resolve

These items should be decided before or during implementation:

1. Exact Better Auth session strategy for installed PWAs.
2. Email delivery provider for invitations and verification.
3. Password versus passwordless/passkey defaults.
4. Exact role model for household versus business workspaces.
5. Workspace Durable Object provisioning lifecycle.
6. Workspace schema migration mechanism.
7. Sync cursor/change-log implementation.
8. Conflict resolution policy by entity type.
9. Device registration and lost-device handling.
10. End-to-end encryption and recovery-key strategy.
11. Data residency requirements by target country.
12. CMS concurrency/versioning details.
13. Translation approval roles.
14. Published course package/version manifest.
15. Automated backup/disaster-recovery strategy.

---

# 42. Guidance for Codex

When Codex works in this repository, it should treat this document as an architectural constraint.

Before making a change that affects:

- framework choice
- authentication
- database tenancy
- synchronization
- content model
- localization
- encryption
- publishing
- offline behavior

Codex should check this document and the relevant Architecture Decision Records.

If a requested change contradicts this architecture, Codex should identify the conflict rather than silently implementing a new architectural pattern.

---

# 43. Current Direction

The current preferred architecture can be summarized as:

```text
PREACT
for lightweight end-user PWAs

REACT
for CMS and administrative applications where its ecosystem saves substantial work

BETTER AUTH
for identity, invitations, sessions, and organization membership

HONO
for secure Cloudflare Worker APIs

D1
for centralized identity/control and CMS data

SQLITE DURABLE OBJECTS
for strongly isolated workspace operational data

R2
for media, attachments, and published course resources

INDEXEDDB
for offline client data

VERSIONED JSON
for efficient offline course delivery
```

This model preserves the lightweight design already established for New Vines while adding a scalable shared platform for authentication, collaboration, course authoring, workspace isolation, and synchronization.

---

## Document Maintenance

This file should live in the repository as:

```text
docs/ARCHITECTURE.md
```

Major architecture changes should be documented as Architecture Decision Records under:

```text
docs/ADR/
```

Suggested first ADRs:

```text
0001-preact-for-end-user-pwas.md
0002-react-for-admin-and-cms.md
0003-better-auth-for-platform-identity.md
0004-d1-for-control-and-content.md
0005-durable-object-sqlite-per-workspace.md
0006-published-json-for-learning-runtime.md
0007-offline-first-sync-model.md
```
