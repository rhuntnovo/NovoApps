# ADR 0018: Configurable Account Email with a Durable Outbox

Status: Accepted. Date: 2026-10-28.

The user authorized real-email setup, selected Mailgun for initial sending without a
project domain, and requested Cloudflare Email Sending preparation and extensible
provider options. Keep Local Preview as the default; external sending needs explicit
Super Admin configuration/enablement. No real test email is sent during development.

Own settings in platform-web/private control D1, independently of content-provider AI
settings. Support Local Preview, Mailgun US/EU and Cloudflare Email Sending REST through
fixed-host adapters. Keep credentials write-only AES-GCM ciphertext, with email-specific
AAD and the existing separately managed credential master Secret. Keep keys out of
browser persistence, read APIs, logs, curriculum and public assets.

Reserve an encrypted UUIDv7 outbox row before outbound I/O. Pin its settings revision,
claim work atomically, check link applicability/expiry, and keep redacted delivery
history. Use Worker background/scheduled hooks and an explicit admin drain. Retry only
confirmed HTTP 429 rejections, bounded by attempt/expiry rules. Unknown submissions
must never auto-replay or silently fail over. Provider acceptance is not inbox delivery.

Cloud copy excludes credentials and all queued messages and disables copied sending.
Preserve identity/course permissions, review semantics and the learner PWA. Domain
purchase/DNS, paid-plan activation, hosted security/cutover, cron provisioning and
provider delivery webhooks remain separate work. Mailgun sandbox requires authorized
recipients; local account links still work only on the development computer.

See [the operating runbook](../19-CONFIGURABLE-ACCOUNT-EMAIL.md).
