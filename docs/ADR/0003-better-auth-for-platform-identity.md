# ADR 0003: Use Better Auth for Platform Identity

**Status:** Proposed / Preferred  
**Date:** 2026-10-20

## Context

New Vines needs centralized identity services including:

- User registration
- Sign-in
- Sign-out
- Password reset
- Email verification
- Session management
- Account management
- Workspace membership
- Email invitations
- Roles
- Potential MFA/passkey support

Supabase Auth provides many of these features, but the preferred platform architecture is increasingly Cloudflare-native.

## Decision

Use **Better Auth** as the preferred authentication and identity framework, subject to implementation validation.

Better Auth should integrate with the central D1 control database.

Better Auth UI may be used in React administrative applications.

The Preact PWAs should use lightweight custom interfaces that authenticate against the same Better Auth-backed platform without importing React UI libraries.

## Important Boundary

Better Auth answers:

> Who is this user?

New Vines authorization answers:

> Which workspace may this user access, and what may they do there?

Authentication and business authorization must remain separate concerns.

## Expected Capabilities

The implementation should support:

- Registration
- Login
- Logout
- Session lifecycle
- Email verification
- Password recovery
- Invitations
- Organization/workspace membership
- Role assignment
- Future MFA/passkeys if appropriate

## Consequences

The central control database becomes authoritative for:

- User identity
- Workspace membership
- Invitation status
- Roles and access relationships

Workspace operational databases must not contain independent user passwords or authentication credentials.

## Open Questions

Before final acceptance, validate:

- PWA session/token behavior
- Offline reconnect behavior
- Invitation workflow
- Email provider integration
- Multiple-device support
- Lost-device recovery
- MFA/passkey support

## Local validation update (2026-10-23)

Better Auth 1.7.12 with Hono/Drizzle/local control D1 and real browser cookies is now
validated for the invite-only CMS pilot (ADR 0013; docs/15). Broader email/recovery,
hosted deployment, MFA, learner sessions and operational workspace integration remain
unvalidated proposals. This update does not declare the entire platform identity design complete.
