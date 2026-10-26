# ADR 0017: Primary Course Reviewers and Recoverable Pending Invitations

Status: Accepted. Date: 2026-10-26.

The user reported that verifying an invited account left it awaiting acceptance
and without Content Studio access after a fresh sign-in. The user also requested
English primary-course editing for NewVines staff and board reviewers.

Keep account creation, mailbox verification and explicit course acceptance as
separate actions. Discover pending invitations from the signed-in account's email
and current control D1 records, without browser-persisted invitation secrets.
An authenticated recipient can accept their own unexpired/unrevoked invitation
by its stable ID after verification. Retain token-based registration/acceptance for
existing links. An ID alone is never authority; check the current recipient,
verification and invitation state again when granting access. Do not auto-accept
all invitations on verification or sign-in.

Refresh visible account status on focus/visibility and every 15 seconds, with
explicit Refresh controls. No cross-browser private data or bearer fragments are
broadcast. Pending lists contain course/provider/context labels and IDs, not tokens.

Allow primary and translated course invitations through the same reviewer role
and existing provider/primary-course/exact-locale grant model. Primary text edits
require an explicit wording unlock and retain review-required drafts, immutable
import snapshots, prior revisions, actor attribution and concurrency checks.
Translation reviewers retain read-only access to their primary course unless
separately granted its exact locale. An English grant does not grant Spanish access.

Reviewers still cannot publish, change structure/headings, replace arbitrary media,
manage invitations or AI settings. Existing AI generation controls remain unchanged;
this increment adds no primary-course reviewer AI capability. No new schema, role
or global administrator promotion is needed. Neither hosting nor external sending
is included.

See [account email/recovery](../18-ACCOUNT-EMAIL-AND-RECOVERY.md) and
[the local authentication permission model](../15-LOCAL-INVITE-ONLY-AUTHENTICATION.md).
