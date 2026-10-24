"""Verified local CMS backups. Only generated snapshots are written; source data is read-only."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile

ROOTS = ('state', 'media', 'imports')
CHUNK = 1024 * 1024


class BackupError(Exception):
    pass


def long_path(path):
    value = str(Path(path).absolute())
    if os.name == 'nt' and not value.startswith('\\\\?\\'):
        return '\\\\?\\UNC\\' + value[2:] if value.startswith('\\\\') else '\\\\?\\' + value
    return value


def linked(path):
    info = os.lstat(long_path(path))
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & 0x400)


def below(path, parent):
    return path == parent or parent in path.parents


def fingerprint(path):
    info = os.stat(long_path(path))
    return (info.st_size, info.st_mtime_ns, info.st_ino)


def secret_name(name):
    name = name.lower()
    return name == '.env' or name.startswith('.env.') or name == '.dev.vars' or name.startswith('.dev.vars.')


def inventory(local):
    files = {}
    omitted = {'sqliteSidecars': 0, 'secretConfiguration': 0}
    present = {}
    for name in ROOTS:
        root = local / name
        present[name] = os.path.isdir(long_path(root))
        if not present[name]:
            if name == 'state':
                raise BackupError('Local state is missing. Start/import the local CMS before backing it up.')
            continue
        if linked(root):
            raise BackupError('Backup source cannot be a symlink or junction: ' + name)

        def walk(directory):
            with os.scandir(long_path(directory)) as entries:
                items = sorted(entries, key=lambda item: item.name)
            for item in items:
                source = directory / item.name
                relative = source.relative_to(local).as_posix()
                if linked(source):
                    raise BackupError('Symlink/junction requires a separate backup: ' + relative)
                if secret_name(item.name):
                    omitted['secretConfiguration'] += 1
                    continue
                if item.is_dir(follow_symlinks=False):
                    walk(source)
                elif item.is_file(follow_symlinks=False):
                    # WAL contents are incorporated by SQLite itself, never copied live.
                    if item.name.endswith(('-wal', '-shm', '-journal')):
                        base = str(source).rsplit('-', 1)[0]
                        if Path(base).suffix.lower() in ('.sqlite', '.sqlite3', '.db') and os.path.isfile(long_path(base)):
                            omitted['sqliteSidecars'] += 1
                            continue
                    files[relative] = {'source': source, 'stat': fingerprint(source),
                                       'database': source.suffix.lower() in ('.sqlite', '.sqlite3', '.db')}
                else:
                    raise BackupError('Unsupported source file: ' + relative)
        walk(root)
    return files, omitted, present


def authoring(relative):
    return relative.startswith('state/v3/d1/') and PurePosixPath(relative).name != 'metadata.sqlite'


def connect_source(path):
    # mode=ro prevents accidental database creation and any writes to curriculum.
    return sqlite3.connect(path.absolute().as_uri() + '?mode=ro', uri=True, timeout=10)


def snapshot(connection, output, compact):
    deadline = time.monotonic() + 60

    def progress(*_arguments):
        if time.monotonic() > deadline:
            raise BackupError('SQLite snapshot timed out; pause editing and retry.')
    if compact:
        connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
        try:
            connection.execute('VACUUM INTO ?', (str(output),))
        finally:
            connection.set_progress_handler(None, 0)
    else:
        with closing(sqlite3.connect(output)) as target:
            connection.backup(target, pages=256, progress=progress, sleep=0.05)
    with closing(sqlite3.connect(output)) as target:
        target.execute('PRAGMA journal_mode=DELETE').fetchone()
        if target.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise BackupError('SQLite integrity check failed; no completed backup was created.')
        if target.execute('PRAGMA foreign_key_check').fetchone() is not None:
            raise BackupError('SQLite foreign-key check failed; no completed backup was created.')
        tables = {row[0] for row in target.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        counts = {name: target.execute('SELECT count(*) FROM "' + name + '"').fetchone()[0]
                  for name in ('cms_providers', 'cms_courses', 'cms_modules', 'cms_pages', 'cms_page_revisions') if name in tables}
    return {'method': 'vacuum-into' if compact else 'online-backup', 'integrityCheck': 'ok',
            'foreignKeyCheck': 'ok', **({'rowCounts': counts} if counts else {})}


def stream_file(archive, relative, source):
    digest = hashlib.sha256()
    size = 0
    with open(long_path(source), 'rb') as reader, archive.open(relative, 'w', force_zip64=True) as writer:
        while data := reader.read(CHUNK):
            writer.write(data)
            digest.update(data)
            size += len(data)
    return {'path': relative, 'bytes': size, 'sha256': digest.hexdigest()}


def hash_file(path):
    digest = hashlib.sha256()
    with open(long_path(path), 'rb') as reader:
        while data := reader.read(CHUNK):
            digest.update(data)
    return digest.hexdigest()


def safe_member(name):
    path = PurePosixPath(name)
    return bool(name) and not path.is_absolute() and '\\' not in name and ':' not in name and '..' not in path.parts


def verify_archive(path):
    with zipfile.ZipFile(long_path(path)) as archive:
        members = archive.infolist()
        names = [item.filename for item in members]
        if len(set(names)) != len(names) or any(not safe_member(name) for name in names):
            raise BackupError('Archive has duplicate or unsafe paths.')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('format') != 'novoapps-local-cms-backup-1':
            raise BackupError('Unsupported backup manifest.')
        records = manifest['files']
        if len({item['path'] for item in records}) != len(records):
            raise BackupError('Manifest has duplicate files.')
        expected = {'manifest.json', *(item['path'] for item in records)}
        if expected != {item.filename for item in members if not item.is_dir()}:
            raise BackupError('Archive contents do not match the manifest.')
        for record in records:
            digest, size = hashlib.sha256(), 0
            with archive.open(record['path']) as reader:
                while data := reader.read(CHUNK):
                    digest.update(data)
                    size += len(data)
            if size != record['bytes'] or digest.hexdigest() != record['sha256']:
                raise BackupError('Backup checksum mismatch: ' + record['path'])
    return manifest


RESTORE = """NovoApps local CMS backup

This archive contains SQLite snapshots and local media/import files. It does not
contain API keys, .env/.dev.vars files, or unsaved browser edits. Keep it private.

To restore:
1. Verify this archive with npm.cmd run cms:backup -- --verify "<archive.zip>".
2. Stop ALL local CMS/API/media processes and any SQLite editors.
3. Preserve the current services/api-worker/.wrangler/state, media, and imports
   folders in a separate backup before replacing them. Do not restore over live data.
4. Extract state/, media/, and imports/ from this archive into
   services/api-worker/.wrangler/, preserving their exact relative paths.
   Use an extractor with Windows long-path support. The manifest lists which
   roots existed. Start with fresh target folders: old WAL/SHM files must not be
   left beside the restored snapshots. Each snapshot already includes its WAL data.
5. Use Git to restore compatible project code; manifest.json records the commit.
   Git supplies the existing tracked learner images/audio, which are not duplicated
   here unless also present in local media. Configure credentials separately.
6. Run npm.cmd run dev:cms, then inspect providers, modules, translations, and media.

SQLite snapshots are individually consistent. For a coordinated backup, save all
changes, finish generation/publication, and pause editing until backup completes.
The command rejects detected curriculum/media changes, but is not a global
transaction across databases and files. Stop the CMS for the strongest guarantee.
No automatic restore or old-backup deletion is performed by this tool.
"""


def code_commit(repo):
    try:
        result = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=repo, capture_output=True, text=True, timeout=5,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def create_backup(repo, destination=None, compact=False, announce=print):
    repo = Path(repo).resolve()
    local = repo / 'services/api-worker/.wrangler'
    default = (local / 'backups').resolve()
    destination = Path(destination).expanduser().resolve() if destination else default
    if below(destination, repo) and not below(destination, default):
        raise BackupError('Use the default ignored .wrangler/backups folder or a destination outside the repository.')
    if any(below(destination, (local / name).resolve()) for name in ROOTS):
        raise BackupError('The backup destination cannot be inside a source folder.')
    configured = os.environ.get('CMS_MEDIA_STATE')
    if configured and Path(configured).resolve() != (local / 'media').resolve():
        raise BackupError('CMS_MEDIA_STATE uses a custom media folder. This command currently backs up the default local media folder only.')
    files, omitted, roots = inventory(local)
    databases = [relative for relative, entry in files.items() if entry['database']]
    if not any(authoring(relative) for relative in databases):
        raise BackupError('No curriculum D1 database was found; no backup was created.')
    destination.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc)
    basename = 'cms-backup-' + stamp.strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    final = destination / (basename + '.zip')
    checksum = destination / (basename + '.zip.sha256')
    if final.exists() or checksum.exists():
        raise BackupError('Backup name already exists; retry to get a new name.')
    work = Path(tempfile.mkdtemp(prefix='.cms-backup-', dir=destination)).resolve()
    held = []
    try:
        for relative in databases:
            if authoring(relative):
                connection = connect_source(files[relative]['source'])
                try:
                    version = connection.execute('PRAGMA data_version').fetchone()[0]
                except BaseException:
                    connection.close()
                    raise
                held.append((relative, connection, version))
        snapshots, details = {}, []
        announce('Creating verified snapshots of ' + str(len(databases)) + ' SQLite databases...')
        for index, relative in enumerate(databases):
            output = work / ('database-' + str(index) + '.sqlite')
            connection = next((item[1] for item in held if item[0] == relative), None)
            if connection is not None:
                information = snapshot(connection, output, compact and authoring(relative))
            else:
                with closing(connect_source(files[relative]['source'])) as source:
                    information = snapshot(source, output, False)
            snapshots[relative] = output
            details.append({'path': relative, **information})
        partial = work / 'archive.partial'
        records = []
        announce('Archiving ' + str(len(files) - len(databases)) + ' supporting files (including media and imports)...')
        with zipfile.ZipFile(long_path(partial), 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            for name, exists in roots.items():
                if exists:
                    archive.writestr(name + '/', b'')
            for relative, entry in files.items():
                source = snapshots.get(relative, entry['source'])
                records.append({**stream_file(archive, relative, source), 'kind': 'sqlite-snapshot' if entry['database'] else 'file'})
                if not entry['database'] and fingerprint(entry['source']) != entry['stat']:
                    raise BackupError('Source changed during backup: ' + relative + '. Pause editing/generation and retry.')
            guide = RESTORE.encode('utf-8')
            archive.writestr('RESTORE.txt', guide)
            records.append({'path': 'RESTORE.txt', 'bytes': len(guide), 'sha256': hashlib.sha256(guide).hexdigest(), 'kind': 'guide'})
            manifest = {'format': 'novoapps-local-cms-backup-1', 'createdAt': stamp.isoformat(), 'gitCommit': code_commit(repo),
                        'compactCurriculum': compact, 'roots': roots, 'excluded': omitted, 'databases': details, 'files': records,
                        'consistency': 'Per-database SQLite snapshots; pause editing/generation for coordinated files.'}
            archive.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        after, _, after_roots = inventory(local)
        if files.keys() != after.keys() or roots != after_roots:
            raise BackupError('Source files were added/removed during backup. Pause editing/generation and retry.')
        if any(entry['stat'] != after[relative]['stat'] for relative, entry in files.items() if not entry['database']):
            raise BackupError('Source files changed during backup. Pause editing/generation and retry.')
        for _relative, connection, version in held:
            if connection.execute('PRAGMA data_version').fetchone()[0] != version:
                raise BackupError('Curriculum changed during backup. Pause editing and retry.')
        announce('Verifying every archived file against its SHA-256 checksum...')
        verify_archive(partial)
        with open(long_path(partial), 'r+b') as writer:
            os.fsync(writer.fileno())
        digest = hash_file(partial)
        pending_checksum = work / 'checksum'
        with open(long_path(pending_checksum), 'w', encoding='utf-8', newline='\n') as writer:
            writer.write(digest + '  ' + final.name + '\n')
            writer.flush()
            os.fsync(writer.fileno())
        # Publish only after all snapshots, hashes and quiescence checks succeed.
        os.rename(long_path(pending_checksum), long_path(checksum))
        os.rename(long_path(partial), long_path(final))
        return {'archive': str(final), 'checksumFile': str(checksum), 'sha256': digest,
                'databases': len(databases), 'files': len(records), 'bytes': final.stat().st_size}
    finally:
        for _relative, connection, _version in held:
            connection.close()
        # Only remove this invocation's own scratch directory under the destination.
        if work.parent != destination or not work.name.startswith('.cms-backup-') or linked(work):
            raise BackupError('Refusing unexpected scratch cleanup path.')
        shutil.rmtree(long_path(work))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo-root', type=Path, default=Path(__file__).resolve().parents[1], help=argparse.SUPPRESS)
    parser.add_argument('--destination', type=Path, help='Backup directory; defaults to services/api-worker/.wrangler/backups')
    parser.add_argument('--compact', action='store_true', help='Use VACUUM INTO for curriculum databases (metadata still uses the backup API)')
    parser.add_argument('--verify', type=Path, metavar='ARCHIVE.zip', help='Verify an existing backup without accessing the live CMS')
    args = parser.parse_args()
    if args.verify:
        if args.compact or args.destination:
            parser.error('--verify cannot be combined with --compact or --destination')
        manifest = verify_archive(args.verify)
        sidecar = Path(str(args.verify) + '.sha256')
        if sidecar.exists():
            expected = sidecar.read_text(encoding='utf-8').split()[0]
            if hash_file(args.verify) != expected:
                raise BackupError('Archive checksum does not match its .sha256 file.')
        print('Verified ' + str(len(manifest['databases'])) + ' database snapshots and ' + str(len(manifest['files'])) + ' archived files.')
        return
    print('Save pending edits, finish generation/publishing, and pause editing until this command completes.')
    result = create_backup(args.repo_root, args.destination, args.compact)
    print('Backup complete: ' + result['archive'])
    print('SHA-256: ' + result['sha256'])
    print(str(result['databases']) + ' verified SQLite snapshots; ' + str(result['files']) + ' files; ' + str(result['bytes']) + ' compressed bytes.')
    print('Keep a second copy on another device or in private backup storage.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Backup cancelled. Retry when ready.', file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        print('Backup failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
