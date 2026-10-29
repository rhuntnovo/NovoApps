# Configurable Account Email and Durable Delivery

Date: 2026-10-28. Status: local implementation. No CMS deployment, real email test,
domain purchase, DNS change or paid-plan activation accompanies development.

The user selected Cloudflare Email Sending for future use and Mailgun for initial
testing before obtaining a project domain. Global account email settings belong
to platform-web/control D1, independently of content providers and their AI settings.
Only the Super Admin configures providers, credentials, test requests or history.

## Open Setup

Open http://127.0.0.1:5176/, sign in as Super Admin, then choose **Open Email
Settings** under **Email Settings & Delivery**. This is separate from CMS AI Settings.

The authenticated `dev:cms:auth` and isolated `dev:cms:storage` modes each keep their
own settings. Their additive control migration is
`0002_account_email_delivery.sql`. The launcher applies it on startup. Save pending
edits before restarting; never run a second launcher. Until migration, existing
sign-in/preview behavior continues and setup explains that migration is needed.

**Local Preview** remains active by default. You can save either external provider's
configuration with **Enable External Sending** unchecked. Changing the provider
unchecks that switch so a change cannot silently activate another sender.

## Mailgun First

1. In Mailgun, obtain an existing verified sending domain or its test sandbox.
   A sandbox can be used without buying a project domain. Add/confirm authorized
   recipient addresses in Mailgun before sending sandbox messages.
2. In our setup choose **Mailgun**, enter its **Sending Domain**, select its **US**
   or **EU** region, and set the **Sender Email** allowed by that domain. Mailgun's
   sandbox examples use `postmaster@<your-sandbox-domain>`.
3. Paste a Mailgun sending API key into the password field. Prefer a domain sending
   key over an account-wide administrative key where available. Never paste it into
   chat, source code or another field. Save the configuration; the key field clears.
4. When ready for real email, check **Enable External Sending** and **Save Email
   Settings**. Future invitation, verification, recovery and test actions may now
   send real emails and count against your provider limits.
5. Choose **Send Test Email To Me**. It targets only the signed-in administrator's
   email. For a sandbox, authorize that email in Mailgun first. Refresh **Delivery
   History**, then check the actual inbox/provider logs. Accepted does not prove
   delivery into the recipient's inbox.

The application is still local: account links open `127.0.0.1` on the recipient's
computer. You can test a received link on the development computer. Real email
delivery alone does not enable remote CMS access for the Nicaraguan reviewer.
Hosted URLs/security/cutover remain a later milestone.

Mailgun uses fixed HTTPS API hosts for the selected region, Basic API authentication,
and multipart messages. Open/click tracking is explicitly disabled for these account
links. Native provider sandbox, domain and reputation restrictions still apply.

## Prepare Cloudflare Email Sending

Select **Cloudflare Email Sending**, enter your **Cloudflare Account ID**, an API
token restricted to **Email Sending: Edit** for that account, and the desired sender.
Save with external sending disabled until the sending domain is onboarded and your
account has the required sending access/plan. Settings can be prepared now; no
domain or account service is provisioned by this screen.

The adapter uses the official Cloudflare REST endpoint
`POST /accounts/{account_id}/email/sending/send`, with bearer authentication and
structured plain-text messages. A Workers send-email binding is unnecessary for
this adapter. No Wrangler login/global API key is read or reused by the CMS.

Cloudflare currently requires the sending domain in Cloudflare DNS and onboarded
for Email Sending; arbitrary-recipient sending is a Workers Paid capability. Verify
current account availability before enabling. Email Sending and incoming Email
Routing are different capabilities. No paid plan is enabled here.

## Delivery Behavior

External messages reserve a UUIDv7 row in private control D1 before provider I/O.
The subject/text/URL payload is AES-GCM ciphertext. The outbox records recipient,
purpose, provider/configuration revision, timestamps, attempt count, redacted result
and safe provider reference. Ordinary history never returns keys, bodies or links.

After the account response, Worker `waitUntil` processes up to three due messages.
Active account pages naturally trigger subsequent checks; **Process Pending Emails**
also drains due work. The Worker export includes a scheduled handler for future
hosting. Configure a private hosted cron (for example, once per minute) during
deployment; no live cron or hosted service is provisioned by this local milestone.
With a stopped local Worker no sending/retry runs until it starts receiving work again.

Atomic D1 claims prevent overlapping processors from sending the same queued row.
Settings revisions pin queued work: changing settings cancels earlier queued rows
instead of silently sending them with a new key/provider/sender. An already submitted
request cannot be recalled. Expired links, revoked/rotated/consumed invitations,
verified addresses and spent/expired reset tokens are checked before sending.

| History Status | Meaning |
| --- | --- |
| Queued | Safely stored, awaiting processing |
| Retry | Provider explicitly rejected with HTTP 429; bounded retry is due later |
| Accepted | Provider accepted the submission; inbox delivery is not confirmed |
| Rejected | Definite rejection or configuration problem; no automatic resend |
| Unknown | Response lost, server error or interrupted send; may have been accepted |
| Cancelled / Expired | Link/configuration is no longer applicable; never submitted |

Only explicit HTTP 429 responses retry, with at most three attempts and one/two-minute
delays while the link remains valid. Network failures, 5xx and interrupted sends are
uncertain and never auto-replayed or failed over to another provider. Check provider
logs before requesting a fresh link. Completed/uncertain/expired/cancelled rows remove
their encrypted bearer payload; metadata remains for troubleshooting. This is not an
exactly-once delivery guarantee or a provider bounce/delivery-webhook integration.

The default daily request limit is 100, configurable from 1–1000; it counts queued
external messages (including failed/cancelled messages and tests), not retry attempts,
and resets at midnight UTC. Same recipient/purpose requests are spaced by 30 seconds.
Provider limits also apply. Public reset/verification requests use uniform generic
responses and a timing floor even when reservation fails, so queue/configuration
errors do not disclose which account exists. The broader local identity rate limiter
is still not distributed hosted abuse protection.

## Credentials, Backups and Extensibility

Mailgun and Cloudflare credentials are separate write-only encrypted values. Replacing
or removing one does not reveal or overwrite the other. Settings use optimistic
revisions. Credentials and message payloads reuse the separately stored credential
master Worker Secret (`AI_CREDENTIAL_MASTER_KEY`/version, plus optional previous key)
with email-specific authenticated encryption labels and fresh random nonces. They are
never AI/curriculum records, browser persistence, environment responses or public R2.

Private SQLite backups include ciphertext/outbox metadata. Keep the original master
secret/version separately for recovery, as for AI credentials. Backups may contain
older encrypted queued links; treat them as private account data. Restoring a database
with active outbox rows is a separate explicit recovery operation: keep external
sending disabled and reconcile old Sending/Unknown/Queued rows before dispatch.

Cloud-copy preparation strips both email credentials and all outbox rows, switches
the copied provider to Preview and disables external sending. Local source settings
and existing staging are unchanged. Configure credentials and verify real mailbox
ownership separately during a future controlled cutover.

The setup dropdown reads the server's supported provider registry. Additional email
providers can be added through validated configuration and a dedicated fixed-host
adapter in `email-storage.ts`/`email-delivery.ts`. No arbitrary URL/SMTP relay, silent
provider fallback or unsupported provider is exposed as a working option.

Authoring button labels now use title case, including **Save & Mark Reviewed** and
dynamic Create/Save dialog actions. No curriculum text or approval semantics changed.

## Official References

- [Mailgun sandbox quickstart](https://documentation.mailgun.com/docs/mailgun/quickstart)
- [Mailgun sending API and regions](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-http)
- [Cloudflare sending-domain setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- [Cloudflare Email Sending REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/)
- [Cloudflare Email Service availability](https://developers.cloudflare.com/email-service/)


## Validation and Local Activation

All 90 automated tests passed: CMS/model/API/media (68), private backup (16),
and cloud preparation (6). CMS/account/preview types and builds passed. Provider
HTTP requests were stubbed; tests cover access, revision conflicts, encrypted
credentials/payloads, both Mailgun regions, Cloudflare REST, explicit 429 retries,
uncertain response handling, stale links/configuration, concurrency and limits.

Disposable real Wrangler D1 plus Chrome verified Mailgun/EU setup, cleared key
fields, Cloudflare preparation, retention of both credentials across switches,
external sending disabled, Local Preview test mail, phone-sized layout, and
title-case Create Provider / Save & Mark Reviewed buttons. No real provider email,
actual API credential or paid AI request was used.

Before live local activation, a verified private backup was created:
`cms-backup-20261029T013218Z-8585ac9b.zip` (UTC filename), SHA-256
`ca61abc208b50251936bab0ca68297bc94d46a1339831b0b76a3088f3663b5e7`,
17 SQLite snapshots/231 files. Migration 0002 then added the new empty tables to
both daily local control D1 and its separate Storage Sandbox. No existing rows
were replaced. The running sandbox still reports Preview. No service restart,
live credential setup, external enablement, remote migration or deployment occurred.

## Mailgun Test Reported Unknown (2026-10-28)

A local Workers runtime compatibility bug caused the initial transport to throw
before submitting a request: Workers does not support `redirect: 'error'`. The
adapter now uses `redirect: 'manual'` and explicitly rejects HTTP 3xx responses.
It never follows Location or forwards the credential to another host. This applies
to both Mailgun and Cloudflare Email Sending. See the [Workers Request reference](https://developers.cloudflare.com/workers/runtime-apis/request/).

The earlier broad error handler reported this as Response Lost Or Timed Out.
Historical Unknown rows remain unchanged and are never replayed automatically.
Check Mailgun logs for the original attempt before requesting a new test. After
loading this fix, refresh the account page and use Send Test Email To Me once.
No API key replacement or database migration is required for this fix. If the
Worker is not running in watch mode, save pending CMS work before restarting the
same launcher/dataset. For a sandbox, the recipient must still be authorized in
Mailgun and the configured region must match the sending domain.

A new real workerd regression test bundles the actual email adapters and stubs all
outbound service traffic with fake credentials. It covers both Mailgun regions,
Cloudflare acceptance, and 302/307 refusal with exactly one fixed-host submission.
It fails on the original code before outbound I/O. No actual email or live key is
used by the test. Existing D1 outbox tests also check that redirects do not retry.
