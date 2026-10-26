# Local Account Email and Recovery

Date: 2026-10-24. Status: local development milestone. Invitation, verification
and password-reset messages use a Super Admin-only email preview inbox. No
external email service is connected and the CMS is not hosted.

## Try the Workflows

Use the existing authenticated launcher, `npm.cmd run dev:cms:auth`, or its
separate test copy, `npm.cmd run dev:cms:storage`. Never start a second launcher
while one is running. Both configurations enable `ACCOUNT_EMAIL_MODE=preview`.
If an older launcher needs restarting, save pending edits first. The original
trusted `dev:cms` mode has no account email workflow.

Open http://127.0.0.1:5176/ and sign in. Existing accounts, passwords, provider
grants, drafts, AI credentials and curriculum remain in place. This increment
requires no new migration and does not publish content.

### Verify an Address

1. Sign in and choose **Request Verification Link** if the address is unverified.
   New owner/invited account creation also prepares a verification message.
2. As Super Admin, open **Local Email Previews**, then **View Email** for that
   address. Choose **Open Account Link**. For a test reviewer, copy it into that
   reviewer's separate browser profile.
3. Choose **Verify Email** on the confirmation screen. This does not sign in or
   grant a course role. Return to the original account/invitation tab and choose
   **Refresh Verification Status**, or reopen the original invitation.
4. Accept review access. New acceptance requires a verified address while these
   email workflows are enabled; existing local owners and accepted grants retain
   their access. Sign-in remains available before verification for local testing.

### Invite or Resend

Choose a reviewer email and an existing course/language edition, then **Create
Invitation**. The one-time private link remains available, and an invitation
message appears in Email Previews. Nothing is sent to the actual mailbox.

**Resend Invitation** creates a fresh secret for that same unaccepted invitation
and invalidates the previous link. It renews its seven-day expiry without adding
access. Revoked or accepted invitations cannot be resent. Accepted grants still
require explicit revocation; invitation expiry alone does not remove them.

### Test Password Recovery

1. Keep a Super Admin session open in one browser profile so it can read the
   local preview inbox. Use a different/private profile for the recovery test.
2. On the signed-out account screen choose **Forgot Password?**, enter the account
   email and choose **Request Reset Link**. Responses do not disclose whether the
   account exists. A real account gets a local reset message.
3. Retrieve that message as Super Admin and open the link in the test profile.
4. Enter and confirm a unique password of 12–128 characters. **Reset Password**
   revokes that user's sessions and invalidates their remaining reset links.
5. Sign in with the new password. Course/AI permissions and stored provider keys
   remain unchanged. Keep any existing CMS tab with unsaved edits open; sign in
   again there before saving, as in the existing session-expiry workflow.

The preview inbox is not an emergency bypass. If the sole local administrator
forgets their password and has no live administrator session, this development
inbox cannot be opened. Preserve backups and follow the existing assisted local
recovery process. Actual self-service recovery needs real email delivery before
hosting; do not expose a public owner-reset endpoint.

## Boundaries and Storage

`platform-web` owns the screens; `api-worker` owns the guarded routes and uses
the installed Better Auth implementation for signed verification links, password
hashing, reset-token consumption and session revocation. Public Better Auth native
signup, verify/reset redirect, change-email and password-management routes remain
closed. The application exposes only fixed-origin, JSON POST confirmation routes;
request-supplied redirects are not used.

Links carry tokens in the URL fragment, removed immediately by the account app.
Tokens stay in component memory and POST bodies, never browser persistence or
API request URLs. Opening a link alone makes no account change. Reloading after
fragment removal loses the action; reopen the original message if needed.

- Verification links expire after one hour. Confirming an already verified address
  with a still-valid link is idempotent, not a login or reusable course-access grant.
- Reset links expire after 30 minutes and are single-use. Control D1 stores their
  identifiers hashed, not the raw bearer secret. Password validation precedes
  consumption. Successful resets clear outstanding reset records for that user.
- Better Auth's D1 adapter has transactions disabled. Reset consumption, session
  revocation and password writes are not one cross-operation transaction. The
  installed implementation revokes sessions before changing the password. A later
  database failure can spend the link; request a new one rather than resetting data.
- Existing origin/JSON checks, no-store responses and closed registration remain.
  Local per-operation throttling is bounded to 20 POST attempts/minute per Worker
  instance/database; distributed abuse protection is still a hosting prerequisite.
- Account verification/reset/resend audit events contain actor/target IDs and status,
  never passwords, email bodies, bearer links or tokens. Password recovery does not
  verify an address or recover workspace encryption keys.

Previews are bounded to 100 messages in Worker memory, expire with their links
(and at most 24 hours after creation), and disappear on Worker restart/reload.
Lists contain metadata; explicit Super Admin **View Email** reads the sensitive
message body/link. Reviewers and signed-out visitors cannot read or clear previews.
The local machine administrator remains trusted, as with the existing pilot.
Previews are not durable email delivery, an outbox or a backup artifact.

Only `disabled` and authenticated-loopback `preview` email modes are supported.
Non-loopback preview configuration and unknown external modes fail closed. There
are no mail-provider keys, external email requests or automatically sent messages.

Local preview verification simulates the workflow and does not prove control of a
real mailbox. Future cloud import preparation preserves identity/password/grant
IDs but resets copied `auth_user.email_verified` to false and excludes sessions
and verification records. It changes neither local records nor existing staging.
Hosted accounts must verify again through the real delivery service.

## Validation and Next Work

Automated tests cover owner-only previews, verification expiry/tampering, no
automatic sign-in, verification-required acceptance, account-enumeration responses,
hashed reset identifiers, expired/reused/concurrent resets, password policy,
session revocation, invitation rotation/revocation, origin boundaries and throttling.
Cloud-copy tests verify that simulated verification cannot become hosted proof.

Validation completed: 80 automated tests across CMS/model/API/media (59),
backup (16) and cloud preparation (5) passed. CMS/account/preview types and builds
passed. Disposable real Wrangler D1 plus Chrome exercised owner verification,
protected previews, invitation creation/resend, verified reviewer acceptance,
mobile-sized forgotten/reset-password screens, existing-tab fragment navigation,
password confirmation and session revocation. No external email or paid request
was made. Physical Safari/Android testing remains outstanding.

Before hosting: select a transactional email service and verified sender/domain;
add a durable delivery/retry policy with redacted diagnostics and background work;
require verified accounts at the hosted API; configure HTTPS/Secure cookies/exact
origins and distributed limits; complete role/publication audit handling and a
verified current-data cutover/restore rehearsal. Real Safari/Android device and
external inbox checks remain necessary. Neither a hosted deployment nor external
email sending accompanies this local milestone.

Reference: [Better Auth email/password workflows](https://better-auth.com/docs/authentication/email-password)
and [email verification](https://better-auth.com/docs/concepts/email). Behavior was
also checked against the installed Better Auth 1.7.12 source.

## Pending Invitations and English Reviewers (2026-10-26)

Account creation and email verification are followed by an explicit course
acceptance. Previously, the invitation fragment could be lost between those steps,
leaving the account verified but without a grant. The account screen now lists
**Pending Course Invitations** for the signed-in email, including after a fresh
sign-in or verification in another tab/browser.

For an already-created account: open http://127.0.0.1:5176/, sign in, and choose
**Accept Review Access** under the pending course. If unverified, request/confirm
verification first. No replacement account or invitation is needed while the
original invitation is valid. Expired/revoked invitations need the owner's action.
Verification alone never grants a course role.

The owner sees **Access Active** after acceptance. Visible account pages refresh
on focus/visibility and every 15 seconds; **Refresh Invitations** and **Refresh
Account Status** provide immediate checks without discarding form inputs.

The invitation **Course / Language** dropdown now includes primary English courses,
labelled **(Primary)**, alongside translations. Inviting a primary-course reviewer
grants edits to that exact course/provider/locale. In Content Studio, select
**Create Wording Changes For Review** before changing primary text, then **Save**.
The imported original and prior revisions remain; edits require content review
before publication. Source changes also make dependent translation reviews stale
through the existing source-revision checks.

Reviewers can edit existing text, Scripture, questions and narration scripts.
Page/block structure, headings, arbitrary media replacement, publication, invitation
management and AI settings remain Super Admin operations. Existing translation
AI permissions are unchanged; primary-course reviewer AI is not added here.
Translation-only reviewers still cannot edit English. English-only reviewers
cannot read or edit Spanish without a separate grant. Revocation applies to an
already-signed-in reviewer on subsequent API requests.

Pending lists contain only the current recipient's live invitation IDs and course
labels. Acceptance by ID rechecks signed-in email, verification, expiry, revocation
and prior consumption; no invitation token is returned by these lists or persisted
in browser storage. Stable IDs/roles/schema are unchanged. See ADR 0017.


Validation for this update: all 61 CMS/model/API/media regression tests and the
CMS/account/preview builds passed. Disposable real local D1 plus isolated Chrome
account contexts verified fresh-sign-in invitation recovery, verification followed
by explicit acceptance without the original fragment, automatic owner status refresh,
Spanish default selection, primary English invitations, wording unlock/save/review
flags, and restricted publishing/settings. Phone/desktop layouts were inspected.
Edge's automated debugging endpoint was unavailable, so this update does not claim
an automated Edge browser pass. Tests used disposable accounts/content only; no
external email, paid request, live permission change or publication occurred.
