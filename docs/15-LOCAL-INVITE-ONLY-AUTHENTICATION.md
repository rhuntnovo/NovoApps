# Local invite-only CMS authentication

Date: 2026-10-23. Status: implemented and validated locally. No hosted CMS, remote
D1 database, email delivery or public registration is enabled by this milestone.

## Start the pilot

Save pending edits and stop the previous CMS/API/media terminals with Ctrl+C.
Ports 5174, 5175, 5176, 8787 and 8789 must be free. From the repository root:

```powershell
cd C:\Development\NovoApps
npm.cmd run dev:cms:auth
```

Open **http://127.0.0.1:5176/** for account setup and invitations. Use **127.0.0.1**
consistently for this pilot; localhost and 127.0.0.1 have separate cookie storage.

1. Create the initial owner account with your name, email and a unique password
   of at least 12 characters. Enter credentials in the browser, never in chat.
2. Sign in and select **Open Content Studio** (http://127.0.0.1:5174/).
3. To test reviewer access, open **Account & Access**, enter a reviewer email,
   select the existing Spanish/Nicaragua course edition, and create a link.
4. Copy the link immediately; its secret is not returned by invitation-list APIs.
   Open it in a separate browser profile/private window to simulate the reviewer.
5. Create the invited account (or sign in with that email), then accept review access.
   The reviewer opens the assigned language by default and can compare its primary language.
6. Use **Revoke Access** on the account screen to remove that invitation's grant.
   Revocation is checked on subsequent requests, including an already signed-in session.

**Local invitation URLs work only on this computer.** They cannot yet be sent to
the Nicaraguan reviewer for remote collaboration. Links expire after seven days
unless accepted. Accepted access remains until revoked; link expiry does not
silently end an accepted review assignment. Separate invitations create separate grants.

The launcher reuses existing content D1/media and applies additive migrations.
It never imports over drafts, automatically translates, regenerates media, or publishes.
On an empty installation, first initialize content using the existing local authoring
workflow or the signed-in owner's import endpoint. The auth launcher skips the
unauthenticated bootstrap importer.

`npm.cmd run dev:cms` remains the original trusted local authoring mode. It has no
account boundary. Do not run both modes together, expose either through a tunnel,
or use the legacy mode as a hosted configuration.

## Applications and databases

- `apps/platform-web`: React account setup, sign-in, invitation acceptance and management.
- `apps/cms-web`: authoring with an access boundary and permission-aware controls.
- `apps/cms-preview`: existing Preact renderer; draft content arrives from the trusted CMS parent.
- `services/api-worker/src/auth.ts`: Better Auth 1.7.12, cookie sessions and invitation APIs.
- `services/api-worker/src/authorization.ts`: independent CMS authorization and private media reads.
- `database/control`: separate local `nvi-control-local` D1 schema and reviewed SQL migration.
  Better Auth owns user/session/account/verification tables. Application tables own the
  setup claim, platform administrator, invitations, grants and audit records.
- `database/content`: existing `nvi-content-local`; migration 0004 adds nullable `created_by`
  to page revisions. Existing history remains unassigned rather than inventing an author.

New application identities are UUIDv7. Course grants reference a provider UUID, primary
course UUID and exact language/region string, not a provider name or a user-supplied module.
Cross-database relationships are validated in the API; SQLite cannot enforce a foreign key
between D1 databases. Providers remain separate from future operational workspaces.

## First permission model

| Capability | Initial Platform Owner | Invited Course Reviewer |
| --- | --- | --- |
| Read courses | All providers/courses | Assigned edition and its primary course |
| Edit text, Scripture, narration scripts and existing questions | Yes | Assigned language/region only |
| Mark translation reviewed against current source revision | Yes | Assigned edition only |
| Edit primary content, headings, page/block structure or media locations | Yes | No |
| AI settings/generation, uploads, publishing/storage settings | Yes | No |
| Create/revoke invitations | Yes | No |

The first owner is explicitly a **platform administrator** with all-provider access,
not an implicit owner of only New Vines. Provider-scoped author/publisher roles and
delegated provider administrators are later increments. This pilot invites reviewers
only to an existing translated edition. Course scope covers all its translated modules
for the assigned locale, including modules added later.

Checks run on the API, including direct UUID requests, exports and saved private media
references. UI controls are only usability aids. Reviewer saves cannot change IDs,
block order/types, layouts, image locations, arbitrary extension fields or English.
Changed narration scripts must detach their prior recording. Translation review still
requires comparison with the current source revision and the authorized Scripture.

## Sessions, secrets and audit

Better Auth verifies hashed passwords and issues HttpOnly, SameSite=Lax cookies;
JavaScript never receives its raw session token. Sessions expire after seven days with
server-side activity renewal; cookies may require a fresh sign-in after seven days.
The local HTTP exception is loopback-only. HTTPS/Secure cookies are mandatory for hosting.
There is no localStorage/sessionStorage credential storage or cookie-cached authorization.
An expired-session response displays a sign-in link in a new tab while retaining the
current React draft. Recheck the session and save after signing in again. Closing or
reloading the editor still loses unsaved memory; this is not an IndexedDB draft autosave.

Public Better Auth signup, email-change, password-reset and other native account routes
are deliberately unavailable. Only guarded owner setup and a valid invitation can create
an account. Invitations contain a random 256-bit secret; D1 stores only its SHA-256 hash.
Links carry it in the URL fragment, which the account app removes immediately. Refreshing
that acceptance page loses the in-memory link; reopen the original link if necessary.
Account email is not represented as email-verified: local setup/manual link delivery does
not verify ownership of the mailbox. Email verification/recovery must be added before hosting.

Mutation requests require a trusted exact browser Origin and JSON; cross-site requests
are rejected. Local in-memory rate limiting is deliberately not a distributed production
abuse-control solution. Missing bindings or secrets fail closed in auth mode, and the
non-loopback API restriction is retained even with AUTH_REQUIRED=true.

The launcher creates ignored `services/api-worker/.dev.vars.auth` once with generated
authentication/bridge secrets. It never reads or modifies `.dev.vars.local` or copies its
OpenAI key. Enter AI settings again after switching modes; those settings remain the
existing owner's write-only in-memory development configuration. Multiple users/provider
credentials require a separate hosted secrets policy.

The auth launcher passes the bridge secret directly to the Node media helper. In this
mode direct helper reads/writes are rejected; CMS/preview private media requests go
through authenticated API checks, with no-store responses and preserved byte ranges.
The local machine/OS owner can always access its own files or run the legacy mode.
This pilot does not isolate accounts from a hostile administrator of this computer.

Authenticated page revisions store `created_by`. Authorized CMS mutations are audited
before execution and their final HTTP status is recorded; an unfinished entry has a null
status. Invitation creation/acceptance/revocation and setup also have audit events.
Audit contains IDs/routes/timestamps/status, not passwords, invitation secrets, keys or
curriculum text. Publication approvals include the owner UUID. Cross-D1 audit/content
writes are not a global transaction; this is not yet a tamper-evident production audit log.

## Backup and recovery

Run `npm.cmd run cms:backup` with authoring/sign-in/invitation activity paused (or services
stopped). The backup includes both content and control D1, metadata, media and imports.
The manifest reports identity/grant/invitation/audit row counts without returning their
values. `--compact` safely compacts copies of both D1 databases, retaining explicit IDs;
internal metadata still uses the Backup API.

Secrets are excluded from ZIPs. Keep `.dev.vars.auth` separately in secure private
configuration storage. Replacing its auth secret signs everyone out; accounts/password
hashes/grants remain in control D1, so users can sign in again. Rotating the bridge secret
requires restarting both API and helper together. Never put the file in Git or public R2.

There is no password-reset UI yet. A failed first setup reserves its email to prevent
another address claiming ownership. If setup is interrupted after account creation, stop
services, back up both databases, and perform an assisted local control-database repair
against that reserved account. Do not delete content D1 or reset all local state.
Do not improvise a public reset or owner-bootstrap endpoint for a hosted system.

## Validation and remaining deployment work

`npm.cmd run test:cms` exercises real Better Auth hashing/sessions against isolated SQLite
and covers closed registration, expiry/logout, cookies, CSRF origins, invitation replay,
expiry/revocation/concurrent acceptance, email matching, provider/course/locale isolation,
review/save permissions, actor attribution and denied media/AI/publishing operations.
Existing import/concurrency/review/media/publication regressions remain covered.
`npm.cmd run test:backup` includes control identity/grant snapshot restoration.
`npm.cmd run build:cms` checks/builds all three web applications and the API types.

An isolated local Wrangler Worker and headless Chrome also exercised actual browser
owner setup, sign-in, invitation registration/acceptance, default Spanish selection,
preview, expiry with unsaved draft preservation, re-sign-in/save, immediate revocation,
and direct media-helper rejection. Test identities exist only in disposable ignored state;
the user's owner account is created by the user at first startup. No paid AI calls occurred.

Before remote reviewer access: provision private cloud D1/R2 with a reviewed data import
and restore rehearsal; replace local media files/FFmpeg/subprocess publishing with cloud
services; configure HTTPS/origins, distributed abuse limits, email verification/recovery,
credential policy, provider author/publisher roles and stronger audit/failure handling.
Disable the bootstrap workflow in hosted configuration. Validate real Safari/Android
sessions and invitation delivery before the hosted pilot. ADR 0003's broader account/PWA
capabilities remain a proposal beyond this local validation. The public v0.8.4 learner
PWA, its published curriculum and offline startup/update behavior are unchanged.


Subsequent milestone: [Step 3 storage preparation](16-CLOUD-CMS-STORAGE-AND-PUBLISHING.md)
now provides verified private cloud D1/R2 copies and a separate local storage
sandbox with browser media processing and Worker publication. The original pilot
above still uses its daily local D1/filesystem helper. No CMS is hosted. Email
verification/recovery, hosted credential policy, abuse controls and staging
deployment remain outstanding; the loopback boundary has not been relaxed.

## Account Email and Recovery Update (2026-10-24)

The [local email/recovery milestone](18-ACCOUNT-EMAIL-AND-RECOVERY.md) supersedes
the earlier no-reset/no-verification UI boundary for authenticated local modes.
Super Admin email previews simulate invitation/verification/reset delivery without
external sending. Existing local accounts retain access; new invitation acceptance
requires verification. Hosted delivery, mandatory verified sessions and distributed
limits remain later work. Account previews are not an emergency owner-recovery bypass.
