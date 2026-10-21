# ADR 0010: Use `platform-web` as the Central User Entry Application

**Status:** Accepted  
**Date:** 2026-10-20

## Context

The platform requires a central web experience for:

- Registration
- Sign in
- Account management
- Invitation acceptance
- Workspace management
- Security settings
- Future application launching

The earlier working name `account-web` is narrower than the likely long-term role.

## Decision

Name the central application:

```text
apps/platform-web/
```

It serves as the primary user-facing entry point to NovoApps platform capabilities.

## Initial Responsibilities

- Registration
- Authentication-related screens
- Email verification
- Password recovery
- Invitation acceptance
- Profile
- Workspace creation
- Workspace membership
- Security/account settings

## Future Responsibilities

Potentially:

- Application launcher
- Workspace switcher
- Platform notices
- Subscription/licensing information
- User preferences

## Non-Responsibilities

`platform-web` should not absorb:

- CMS editing
- Learning runtime
- Inventory workflows
- Finance workflows

Those remain separate applications.

## Backend Boundary

`platform-web` is a front-end application.

Central authentication, authorization, and platform APIs live in the shared Worker/API service and central control database.
