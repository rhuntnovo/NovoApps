# ADR 0008: Local CMS pilot with the existing Learning runtime

Status: Accepted for the local milestone, explicitly selected by the user on 2026-10-20.

## Context

The user supplied NEW_VINES_PLATFORM_ARCHITECTURE.md and ADRs 0001–0007, and asked
to begin content management and preview after successful v0.8.3 device testing.
The target sequence builds identity before hosted CMS. The user selected a local
CMS/preview milestone first, with registration before online deployment.

## Decision

Add the new workspace apps/services/packages alongside the existing Learning directory.
Do not move the deployed app or change its framework, package/lockfile, service worker,
or publication flow for this milestone.

Use React for the editor, Hono for the API, local D1 for draft authoring, Drizzle for
schema/migrations, and shared Zod contracts. Use a separate Preact preview entry that
imports the existing learner viewer/CSS, communicates through a validated parent-origin
message, and never registers the learner's service worker.

Authoring identity uses UUIDv7. Preserve existing published IDs and every imported JSON
value, including extensions. Save append-only page aggregates, enforce expected revisions,
and retain an immutable source snapshot. Wording changes need an explicit unlock and a
review flag; there is no approval or publication API in this local pilot.

Keep the API local-only with no production opt-in/database binding. Do not pretend a
local bypass is authentication. Better Auth/control D1, authenticated content permissions,
audit identity, and hosted deployment are the next platform work.

## Consequences

The first CMS is usable without deploying or provisioning cloud resources.
Actual learner rendering and media can be tested without UI duplication or framework mixing.
Page aggregate revisions keep initial concurrency handling simple. More granular block,
translation, approval, and publication tables can follow real authoring requirements.

D1 for nvi-control/nvi-content is accepted by ADR 0004. Better Auth and workspace SQLite
Durable Objects keep their proposed/preferred status until their implementation is validated.
Sensitive-data encryption requirements in AGENTS.md and docs/04 are not weakened by the
target document's conditional encryption wording; recovery/policy must be settled before
private operational data is deployed.

No new public authentication model, tenant sync engine, R2 publishing, remote database,
or deployment is introduced by this decision.
