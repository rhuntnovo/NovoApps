# ADR 0002: Use React for Administrative and CMS Applications

**Status:** Accepted  
**Date:** 2026-10-20

## Context

New Vines requires richer browser applications for:

- Course content management
- Translation and review workflows
- User registration
- Account management
- Workspace administration
- User invitations
- Platform administration

These applications are primarily used on modern browsers and are less constrained by bundle size than the end-user PWAs.

The React ecosystem provides mature open-source utilities for authentication UI, forms, data tables, dialogs, rich editors, and administrative interfaces.

## Decision

Use **React + TypeScript** for administrative web applications where the React ecosystem materially reduces development effort.

Likely applications include:

- `account-web`
- `cms-web`
- `admin-web`

Recommended supporting libraries include:

- Better Auth UI
- shadcn/ui
- Zod
- Suitable React form libraries where useful

## Rationale

React is chosen selectively because:

- Better Auth UI is React-oriented
- shadcn/ui has a strong React ecosystem
- CMS interfaces benefit from mature React component libraries
- Administrative users are less sensitive to small bundle-size differences
- There is no need to burden field PWAs with React simply because the CMS uses it

## Consequences

The platform intentionally uses two front-end frameworks:

- **Preact** for end-user PWAs
- **React** for CMS/admin applications

Shared code should focus on framework-independent concerns such as:

- TypeScript types
- Zod schemas
- API clients
- Authentication helpers
- Localization
- Business rules
- Sync contracts

Framework-specific UI components should generally remain within their respective applications.
