# ADR 0015: Provider AI Credentials, Scoped Capabilities and Activity Ledger

Status: Accepted. Date: 2026-10-24.

The user approved Super Admin-only AI settings, independent translation/Marin
narration/image permissions, and activity history supporting OpenAI bill
reconciliation. Extend the authenticated CMS without hosting it or modifying
canonical content, the public learner, or the email/recovery milestone.

Encrypt provider keys in control D1 with AES-256-GCM and a separately managed
Worker Secret master key. Bind ciphertext to provider/credential/version. Use
write-only configuration APIs and optimistic revisions. Never fall back to another
provider's key. Keep legacy trusted local memory configuration separate. Private
backups include ciphertext; master keys require separate secure recovery storage.
Cloud-copy tooling excludes credential material by default.

The existing global platform owner is the Super Admin. Grant individual AI
capabilities only on existing provider/primary-course/locale reviewer access;
enforce provider switches, grants and revocation at the API. Allow only
server-recorded generated assets for reviewer attachment. AI never approves or
publishes canonical content. Manual media/structure/publication remain owner actions.

Reserve an activity record before spending; fail closed if it cannot be recorded.
Capture identifiers and reported numeric usage, not prompts or secrets. Preserve
uncertain/rejected requests and separate upstream outcome from saved output.
Use atomic daily/concurrency request limits and no automatic paid retries.

Provide Super Admin filtering, CSV export, reconciliation notes/status and an
append-only reconciliation event history. Do not fabricate missing token usage or
label inferred charges as an invoice. OpenAI billing remains authoritative; no
organization Admin API key or automatic bill import is introduced.

See the [runbook](../17-SUPER-ADMIN-AI-AND-ACTIVITY.md).
