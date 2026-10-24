# ADR 0014: Prepare Private Cloud CMS Storage Before Hosting

Status: Accepted for step 3. Date: 2026-10-23.

Provision separate staging control/content D1 databases and a private
`novoapps-drafts` R2 bucket. Preserve the existing public `novoapps-content` bucket
for approved immutable curriculum releases. The user explicitly approved a
verified private staging snapshot including account emails/password hashes and
permissions, excluding sessions, verification tokens and API keys.

Keep the daily authoring source local. Staging is a point-in-time copy, not sync.
Rehearse imports into fresh targets, verify all D1 table fingerprints and private
asset checksums, and preserve IDs, wording and source/reviewer history. Never
silently replace populated cloud data or newer local work during a later cutover.

Implement opt-in Worker-bound private media/publication paths. Use browser Canvas
and on-demand single-thread FFmpeg-WASM for image/manual recording preparation;
retain the native helper in ordinary local mode. Private tool binaries must not
inflate learner bundles. Keep paid AI generation explicit and credentials private.

Use a separate authenticated local storage sandbox to validate D1/R2 without
mixing cloud media references into the daily filesystem-backed dataset. Sandbox
publishing is emulated locally. Publication requires saved/reviewed revisions,
ownership checks, cross-instance D1 leases, immutable objects and a conditional
latest pointer written last. D1/R2 reconciliation remains necessary after crashes.

This accepts storage preparation, not hosted identity readiness. Retain loopback
denial and do not deploy the CMS/API. Email/recovery, hosted credential policy,
distributed abuse limits, production audit/backup/cutover and real-device/resource
limits must be addressed before remote review. The public learner stays independent.

See the [implementation and operating runbook](../16-CLOUD-CMS-STORAGE-AND-PUBLISHING.md).
