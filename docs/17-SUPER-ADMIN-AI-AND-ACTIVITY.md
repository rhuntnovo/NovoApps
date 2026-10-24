# Super Admin AI Settings and Activity Reconciliation

Date: 2026-10-24. Status: implemented for authenticated local CMS modes. The CMS
is not hosted and the public learner is unchanged. No real AI generation or
remote billing queries were performed during development.

## Open the Controls

Use `npm.cmd run dev:cms:auth` for daily authoring, or `dev:cms:storage` for its
separate local test copy. After this upgrade restart the launcher once: it applies
control migration `0001_ai_credentials_activity.sql` and configures the local
credential encryption secret. Save edits before restarting. Never run two launchers.

Sign in at http://127.0.0.1:5176/, open Content Studio, select the provider, then
open **AI Settings**. The initial platform owner is the **Super Admin**. Existing
accounts and grants retain their IDs. No additional global administrators are
automatically created; their delegation remains a later identity feature.

The dialog has three tabs:

- **Settings**: replace/remove that provider's OpenAI key, optional OpenAI Project
  ID, translation model, provider-wide feature switches and daily request limit.
- **Permissions**: grant Auto Translate, Generate Marin Narration and Generate
  Images independently to existing invited course reviewers. Their provider,
  primary-course and exact language/context boundaries remain in force.
- **Activity & Reconciliation**: filter requests by UTC dates, feature, outcome
  and reconciliation; review metadata, add an invoice/period note, mark/unmark
  reconciliation and export matching records to CSV.

When saving a key, usually leave **OpenAI Project ID (Optional)** blank to use
the key's default project. To specify one, enter its actual ID beginning with
`proj_`, not the project name or API key. An invalid Project ID prevents the
whole settings save; clear or correct that field, then save again.

Reviewers have no generation access by default. They never manage settings,
credentials, activity history, permissions or publication. Revoking base course
access cascades AI grants; feature revocation is also checked on subsequent API
requests and again before applying an in-flight result. Permission changes do not
cancel a request already sent to OpenAI, and that request may still be billed.

Legacy `dev:cms` remains trusted unauthenticated local authoring with its original
temporary in-memory AI settings. It does not provide identity-attributed billing
history or the hosted credential policy. Use the authenticated commands for this
milestone; the legacy mode is never a hosted configuration.

## Credential Storage and Recovery

Provider keys are AES-256-GCM ciphertext in **control D1**, with independent random
96-bit nonces, key version and opaque UUIDv7 credential reference. Authentication
data binds ciphertext to provider, credential reference and key version; moving a
record between providers cannot decrypt it. Credentials are never course content,
browser storage, learner assets, public R2 objects or ordinary API response fields.

The Worker decrypts only for an authorized request. Settings are write-only: the
field clears after saving and later shows configuration/last-updated information.
Changing/removing a key retains earlier activity and its original credential
reference. An absent provider key never falls back to another provider's key or
an environment-wide key in authenticated mode. Optimistic settings revisions
prevent one administrator window from silently overwriting another.

Local launchers append a generated `AI_CREDENTIAL_MASTER_KEY` (32 random bytes
encoded as 64 hex characters) and `AI_CREDENTIAL_KEY_ID=v1` to their ignored
`.dev.vars.auth` or `.dev.vars.storage` configuration. They never copy an OpenAI
key between modes. Do not read or expose these files in agent output.

For hosting, provision those values using **Cloudflare Worker Secrets** in the
appropriate environment; do not put values in Wrangler vars, source or build
artifacts. This milestone does not provision a hosted Worker or cloud secrets.
An optional previous master key/version pair can read prior ciphertext during a
planned migration; it does not automatically re-encrypt all records. Back up the
master secret separately, with version/environment information. Replacing or losing
it makes existing ciphertext unreadable; preserve the original secret/database
and restore the correct key, or explicitly replace the provider's OpenAI key.

Private local backups include encrypted credential rows, grants, artifacts,
activity and reconciliation events. They exclude environment secrets, so a ZIP
alone cannot recover provider credentials. Cloud-copy preparation deliberately
clears credential ciphertext, nonce, encryption version and current credential
reference while preserving settings and historical activity. Configure credentials
separately in any imported environment; never rerun a cloud import over populated
targets. Nothing is automatically synchronized or uploaded.

## What Is Recorded

Every authenticated outbound request receives a UUIDv7 activity ID before it is
sent. The same ID is supplied as `X-Client-Request-Id`. The ledger includes:

- UTC start/completion times, actor name/ID, provider, primary course, module,
  page/block, language/context, feature and endpoint.
- Credential reference and optional explicitly configured OpenAI Project ID;
  requested/returned model, voice, image size/quality and input character count.
- HTTP outcome, OpenAI request/response/organization identifiers when available.
- Reported input/output/cached/reasoning/text/image/audio token details when
  supplied by the endpoint, returned image count and recorded narration bytes.
- Whether a result was generated or saved to curriculum, separately from whether
  OpenAI successfully handled the request. A later save conflict or revocation
  does not erase the potentially billable request.

The activity ledger stores no keys, prompts, scripts, response text/images/audio,
or upstream error bodies. Generated-asset receipts separately store the private
asset metadata and script hash needed to authorize attachment. Reviewers can save
only their server-recorded generated assets for that module/page/block; they
cannot substitute arbitrary image paths or reuse a recording for different text.
Prepared image upload retries reuse their original receipt instead of creating a
second artifact. Manual uploads/recording remain owner capabilities.

## Comparing With an OpenAI Bill

1. Prefer a dedicated OpenAI project/key for NovoApps or each content provider.
   Enter its optional `proj_...` ID so requests explicitly use that project.
2. Select the same UTC billing period and provider in Activity & Reconciliation.
3. Export CSV and group by project, date, endpoint/model, credential and feature.
   Detailed usage JSON preserves cached/reasoning/image/audio distinctions; cached
   tokens are part of reported input totals, not extra tokens to add again.
4. Compare with OpenAI's usage/billing export, then add an invoice/period reference
   and mark reviewed rows reconciled. Notes/status changes are versioned and
   append reconciliation events without rewriting the original usage record.

The ledger is a reconciliation aid, **not an invoice or automatic dollar-cost
calculator**. Credits, taxes, discounts, cached pricing and other applications'
usage are not inferred. No OpenAI organization Admin API key is requested or
stored, and no billing API connection or invoice import is included. Activity
starts with this version; past requests cannot be reconstructed from CMS drafts.

Missing usage stays null/blank, never fabricated as zero. The current binary Opus
speech response supplies audio rather than a token-usage JSON object; its input
characters and returned bytes are recorded, not treated as billable audio tokens.
Image/translation usage is stored only when actually reported. Aggregate token
totals are explicitly partial when any records lack usage.

An HTTP rejection is recorded as **rejected**. A lost connection/timeout is
**unknown**, since OpenAI may have processed the request. A Worker interruption
can leave **pending**. Retain the client/request IDs and check OpenAI before an
explicit retry. No paid request is automatically retried. Active pending requests
cannot be marked reconciled; old uncertain records can be investigated manually.

A failed activity reservation prevents the paid request. Atomic D1 reservations
enforce a provider's request limit (default 100/day, configurable 1-10,000, UTC)
and at most two active requests per provider; abandoned pending slots age out
after ten minutes. These are request/concurrency limits, not monetary budgets or
the distributed account-abuse controls still required before hosting.

If OpenAI responds but ledger finalization fails, the durable initial row remains
pending and the API tells the user not to retry blindly. A later save/bookkeeping
failure can leave application status conservative. D1/content/media writes are
not one global transaction; operational reconciliation remains necessary.

## Validation

Tests stub all paid calls and cover encryption/tampering/recovery-key selection,
write-only/provider isolation, stale settings, scoped reviewer generation and
revocation, exact usage/IDs, missing usage, denied spending, concurrent reservations,
CSV formula protection, reconciliation races and generated image/Marin ownership.
Cloud-copy tests verify credential exclusion while preserving usage/identity.
CMS builds and existing authoring/authentication/storage regressions also run.

Official references: [Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Worker Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/),
[OpenAI request IDs/authentication](https://developers.openai.com/api/reference/overview),
[speech responses](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create),
[image usage](https://developers.openai.com/api/reference/resources/images/methods/generate).


Live local activation applied the additive control migration to both the daily and
storage-sandbox databases after verified backup
`cms-backup-20261024T185222Z-fe53da6e.zip`. Their private encryption configuration
was initialized without revealing values. The running storage Worker reloaded its
configuration and reports credential storage ready; the editor was not restarted.

Disposable real Wrangler D1 plus Chrome verified provider key save/clearing,
activity display, versioned reconciliation, CSV download, reviewer feature controls
and hidden Super Admin settings. No real OpenAI request was made. Desktop and
phone-sized dialogs were visually checked. These tests do not establish remote
reviewer hosting or physical-device support.

Final validation: 77 automated tests passed across CMS/API/media, backup, cloud
preparation and launcher suites; CMS builds/types passed. The final verified
local recovery ZIP is cms-backup-20261024T185857Z-472eb98e.zip (17 SQLite snapshots,
231 files). Encryption secrets remain excluded and require separate secure backup.
