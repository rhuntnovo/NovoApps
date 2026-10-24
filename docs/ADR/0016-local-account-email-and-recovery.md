# ADR 0016: Validate Account Email and Recovery Locally

Status: Accepted for the local milestone. Date: 2026-10-24.

The user approved invitation delivery, email verification and password-recovery
development using local email previews first. Keep identity screens in platform-web,
authorization in api-worker, and the independent learner unchanged.

Use Better Auth's verification and reset primitives behind fixed-origin guarded
application routes. Require explicit POST confirmation, fragment-based links,
hashed reset identifiers, reset-session revocation, generic request responses and
private audit events. Keep public registration and native account bypass routes closed.

Provide an authenticated-loopback, Super Admin-only, bounded in-memory development
mailbox. It sends no external email and loses messages on Worker restart. Local
preview verification is simulated; cloud-copy preparation must clear copied email
verification flags before real hosted verification. Preserve local owner/accepted
grant access; require verification before new invitation acceptance in preview mode.

Resend rotates only unaccepted, unrevoked invitation secrets. It must not add grants
or revive revoked access. Password recovery changes credentials/sessions only, not
permissions, curriculum or encryption keys.

This supersedes ADR 0013's no-recovery/no-email-workflow boundary only for local
development. External delivery/provider configuration, mandatory hosted verification,
distributed abuse controls, durable mail handling and staging deployment remain later
increments. Do not expose previews or bootstrap setup as hosted recovery shortcuts.

See [the runbook](../18-ACCOUNT-EMAIL-AND-RECOVERY.md).
