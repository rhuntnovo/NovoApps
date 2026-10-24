# ADR 0013: Validate invite-only CMS identity locally before hosting

Status: Accepted for the local pilot. Date: 2026-10-23.

The user authorized step one of invite-only CMS authentication. Implement Better Auth
with a separate local control D1, account UI in platform-web, and API-owned permissions.
Retain the original local authoring command and the non-loopback API denial. Add an
explicit `dev:cms:auth` command for testing the account boundary without deploying.

The initial platform administrator manages invitations. Invited reviewers receive exact
provider/primary-course/locale grants, read the matching primary language, and edit/review
only their translated edition. They cannot use AI credentials, publish, or change structure.
Permission checks apply to all CMS operations and saved private media reads; UI hiding
alone is insufficient. Registration requires a valid invitation; links are created locally
with no email sending. No operational workspace membership model is introduced.

Use UUIDv7 identities, hashed invitation secrets, HttpOnly cookie sessions, server-side
revocation, authenticated revision authors and an initial private audit trail. Preserve
all source wording, existing drafts/history and the public learner's offline behavior.
Keep local auth/bridge secrets out of Git, browser persistence and course documents.

Validation establishes Better Auth's compatibility with local Hono/Drizzle/D1 and browser
cookies for this pilot. It does not approve a production deployment, email/recovery model,
multi-provider credentials, distributed rate limiting, cloud media workflow, or learner
account/synchronization behavior. Those remain explicit subsequent milestones.

See [the operating runbook](../15-LOCAL-INVITE-ONLY-AUTHENTICATION.md).
