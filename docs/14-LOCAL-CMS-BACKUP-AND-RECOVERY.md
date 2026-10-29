# Local CMS backup and recovery

Date: 2026-10-23. This is a manual local backup command, not cloud synchronization.

## Make a backup

Save pending CMS edits, let translation/narration/image generation and publication
finish, and pause editing until the command completes. From the repository root:

```powershell
cd C:\Development\NovoApps
npm.cmd run cms:backup
```

Python 3 is already used by the PowerPoint import workflow. No new npm or Python
dependency is required. The Node launcher selects `python` on Windows and `python3`
elsewhere. Set `CMS_BACKUP_PYTHON` to a Python executable path if necessary.

The default output directory is:

```text
C:\Development\NovoApps\services\api-worker\.wrangler\backups\
```

Each invocation creates a new, UTC-dated ZIP and `.zip.sha256` sidecar. Filenames
also include a random suffix, so repeated backups do not overwrite previous copies.
The command prints the completed archive path, checksum, snapshot count and size.

For compact content/control D1 snapshots using `VACUUM INTO`:

```powershell
npm.cmd run cms:backup -- --compact
```

To choose a private destination outside the repository:

```powershell
npm.cmd run cms:backup -- --destination "C:\NovoAppsBackups"
```

The two options can be combined. A custom destination is a directory, not a ZIP
filename. Paths containing spaces are supported. Within this repository, only the
default ignored backup directory and its descendants are allowed. Source folders
cannot be destinations, and older backups are not included recursively.

## Contents and consistency

The archive preserves paths relative to `services/api-worker/.wrangler/`:

| Path | Contents |
| --- | --- |
| `state/` | SQLite snapshots for all discovered local databases, including Wrangler metadata, plus other state files |
| `media/` | Locally recorded/generated/uploaded images and narration, publication files and settings |
| `imports/` | Private PowerPoint originals, inventories, stable-ID registries and prepared course drafts |
| `manifest.json` | File sizes and SHA-256 hashes, database checks, curriculum/identity/access row counts, included roots and Git commit |
| `RESTORE.txt` | Recovery instructions |

Missing optional media/import roots are recorded in the manifest. A missing state
folder or missing curriculum D1 database stops the command rather than producing an
apparently complete backup. A custom `CMS_MEDIA_STATE` location is rejected explicitly;
this version supports the default local media directory only.

SQLite is read through read-only connections. The default method is SQLite's Online
Backup API; committed WAL transactions are incorporated into each standalone snapshot.
Raw live `-wal`, `-shm` and rollback-journal sidecars are omitted when their database
exists. `--compact` applies `VACUUM INTO` to content/control D1 databases with explicit primary keys; Wrangler
metadata and other internal databases always use the Backup API to preserve internal
row identities. The original databases are never vacuumed or replaced.

Each snapshot must pass both `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.
The ZIP is streamed with Windows extended-path support rather than copying the deep
media hierarchy into another long directory. Every archived file is read back and
matched against its size and SHA-256 hash before the final archive is exposed.

The tool detects content/control commits while it is copying, and media/import/supporting
files added, removed or changed during the backup. Detected changes fail the command
without publishing a completed archive; pause work and retry. Symlinks and junctions
are rejected rather than following files outside the selected roots.

Snapshots are individually consistent; this is not a single transaction across all
databases and media. The checks detect ordinary concurrent changes, but cannot prove
an atomic filesystem snapshot. For the strongest complete-environment guarantee,
save and stop the CMS/API/media services and SQLite editors before running the command,
then restart with `npm.cmd run dev:cms`. The command does not stop or restart services.

`.env` and `.dev.vars` configuration files are excluded. Unsaved browser edits and
in-memory API keys are not backed up. The archive contains private drafts and source
files: keep it in private storage, out of Git and the public curriculum bucket.
Tracked legacy images/audio and application code remain recoverable through Git.

## Verify an existing backup

```powershell
npm.cmd run cms:backup -- --verify "C:\NovoAppsBackups\cms-backup-<timestamp>-<suffix>.zip"
```

Verification checks archive paths, duplicates, manifest membership, ZIP read/CRC
errors, and every file's length and SHA-256. If the sidecar is present, it checks the
entire ZIP's checksum as well. It requires no live CMS/database connection and does
not extract or restore anything. Checksums detect accidental corruption, not an
attacker who can replace both an archive and its checksum files.

## Restore

1. Verify the archive first.
2. Stop the local CMS/API/media services and SQLite editors.
3. Back up/preserve the current `state`, `media` and `imports` folders separately.
4. Extract the archived folders into `services/api-worker/.wrangler/`, preserving
   their paths. Use an extractor supporting Windows long paths. Start with fresh
   target folders; do not overlay snapshots onto old database WAL/SHM sidecars.
5. Restore compatible application code from Git; the manifest records its commit.
   Reconfigure credentials separately.
6. Run `npm.cmd run dev:cms` and check modules, translations, revisions and media.

No automated restore, source deletion, backup pruning, scheduling or cloud upload is
included. Keep multiple dated copies and a second copy on another device/private
backup service. Sync a completed archive rather than the live SQLite directory.

## Implementation and validation

- `tooling/backup-cms.mjs`: npm/Node launcher; safe argument passing without a shell.
- `tooling/backup_cms.py`: standard-library SQLite snapshots, archive, hashes and verification.
- `tooling/test/test_backup_cms.py`: 11 isolated backup/recovery tests.
- `npm.cmd run test:backup`: tests WAL recovery, exact curriculum text, metadata row
  identities, compact snapshots, media/import recovery, Windows paths exceeding 260
  characters, concurrent changes, corrupt databases, archive tampering, destination
  protection, safe failure cleanup, preservation of older backups, and standalone verification.

Official behavior references:
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [SQLite VACUUM INTO](https://www.sqlite.org/lang_vacuum.html#vacuum_with_an_into_clause)
- [SQLite WAL persistence](https://www.sqlite.org/wal.html#the_wal_file)

Live validation created and independently verified a backup containing seven SQLite snapshots and 176 archived files. An isolated restore of its curriculum database passed integrity checking and recovered two course editions, eight modules, 95 stored page records (including archived pages), and 150 page revisions. The original running CMS data was not replaced.

The invite-only pilot adds a separate local control D1 to the same state tree;
it is included automatically with accounts, password hashes, sessions, invitations,
permissions and audit. Pause sign-in/invitation activity as well as editing, or stop
services. Backups are private credentials-bearing data. Generated .dev.vars.auth
secrets remain excluded and need separate secure configuration storage. Restart
restored account-enabled environments with npm.cmd run dev:cms:auth; see docs/15.


Step 3 also includes nested `state/storage-sandbox/` D1 databases and emulated R2
blobs in this same archive. They are a separate test dataset, not a replacement
for the main `state/v3/d1/` authoring data. Compact mode recognizes nested D1
snapshots too. The current backup suite has 15 tests. `--json` provides verified
archive metadata for tooling; it does not return database contents or secrets.

The local ZIP does not back up remote staging D1 or R2. Preserve the verified
migration source ZIP/manifest privately and plan remote database exports plus
private object backups before hosted authoring begins; see docs/16. A staging
copy is not an ongoing backup or synchronization service.


Authenticated provider AI settings add encrypted credential rows, grants, activity,
asset receipts and reconciliation events to control D1, all included in private
snapshots. The encryption master keys in ignored .dev.vars.auth/.storage remain
excluded. Preserve those separately with their environment/version labels; a ZIP
alone cannot decrypt provider API keys. Do not generate a replacement master key
as a recovery shortcut. See docs/17 for rotation and restore boundaries.

The account-email milestone adds encrypted provider credentials and queued bearer
payloads to control D1. Private backups include that ciphertext; the existing
credential master Secret remains separately required for recovery. Restore with
external sending disabled and reconcile pending/uncertain delivery records before
dispatch, rather than replaying historical account links. Cloud-copy preparation
excludes email credentials and outbox rows. See docs/19.
