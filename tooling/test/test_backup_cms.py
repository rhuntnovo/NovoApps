import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.dont_write_bytecode = True
loader = importlib.util.spec_from_file_location('backup_cms', Path(__file__).resolve().parents[1] / 'backup_cms.py')
backup = importlib.util.module_from_spec(loader)
loader.loader.exec_module(backup)


class BackupTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.repo = Path(self.temporary.name) / 'NovoApps'
        self.local = self.repo / 'services/api-worker/.wrangler'
        self.content = self.local / 'state/v3/d1/database/content.sqlite'
        self.content.parent.mkdir(parents=True)
        self.writer = sqlite3.connect(self.content)
        self.writer.execute('PRAGMA journal_mode=WAL')
        self.writer.execute('PRAGMA wal_autocheckpoint=0')
        self.writer.execute('CREATE TABLE cms_pages(id TEXT PRIMARY KEY, text TEXT)')
        self.writer.execute('INSERT INTO cms_pages VALUES (?,?)', ('uuid-page', 'Exact Scripture – God’s Word.'))
        self.writer.commit()
        self.metadata = self.content.parent / 'metadata.sqlite'
        with sqlite3.connect(self.metadata) as connection:
            connection.execute('CREATE TABLE registry(name TEXT)')
            connection.execute('INSERT INTO registry(rowid,name) VALUES (42,?)', ('local-d1',))
        connection.close()
        self.image = self.local / 'media/assets/image.webp'
        self.image.parent.mkdir(parents=True)
        self.image.write_bytes(b'original-image-bytes')
        audio = self.local / 'media/audio/recording.opus'
        audio.parent.mkdir(parents=True)
        audio.write_bytes(b'original-opus-bytes')
        raw = self.local / 'imports/course/source.pptx'
        raw.parent.mkdir(parents=True)
        raw.write_bytes(b'original-private-pptx')
        (self.local / 'media/.dev.vars.local').write_text('DUMMY_KEY=never-include', encoding='utf-8')
        (self.local / 'media/.env').write_text('DUMMY_KEY=never-include', encoding='utf-8')
        self.destination = Path(self.temporary.name) / 'private-backups'

    def tearDown(self):
        self.writer.close()
        # Fixture media deliberately exceeds MAX_PATH; clean only this owned temp root.
        target = Path(self.temporary.name).resolve()
        if target != self.repo.parent or target.parent != Path(tempfile.gettempdir()).resolve():
            raise RuntimeError('Unexpected fixture cleanup path')
        shutil.rmtree(backup.long_path(target))
        self.temporary.cleanup()

    def create(self, **kwargs):
        return backup.create_backup(self.repo, self.destination, announce=lambda _message: None, **kwargs)

    def assert_no_completed_backup(self):
        if self.destination.exists():
            self.assertEqual(list(self.destination.iterdir()), [])

    def test_online_backup_includes_committed_wal_and_restores_metadata_media_and_imports(self):
        self.assertTrue(Path(str(self.content) + '-wal').exists())
        source_hash = backup.hash_file(self.content)
        result = self.create()
        archive = Path(result['archive'])
        manifest = backup.verify_archive(archive)
        self.assertEqual(len(manifest['databases']), 2)
        self.assertEqual(manifest['roots'], {'state': True, 'media': True, 'imports': True})
        self.assertEqual(manifest['excluded']['secretConfiguration'], 2)
        self.assertGreaterEqual(manifest['excluded']['sqliteSidecars'], 2)
        names = [item['path'] for item in manifest['files']]
        self.assertFalse(any(name.endswith(('-wal', '-shm')) or '.dev.vars' in name or name.endswith('/.env') for name in names))
        self.assertEqual(backup.hash_file(self.content), source_hash)
        self.assertEqual(Path(result['checksumFile']).read_text().split()[0], backup.hash_file(archive))
        self.assertEqual(next(db for db in manifest['databases'] if db['path'].endswith('content.sqlite'))['rowCounts'], {'cms_pages': 1})
        with zipfile.ZipFile(archive) as saved:
            restored = Path(self.temporary.name) / 'restore-content.sqlite'
            restored.write_bytes(saved.read('state/v3/d1/database/content.sqlite'))
            with sqlite3.connect(restored) as connection:
                self.assertEqual(connection.execute('SELECT * FROM cms_pages').fetchall(), [('uuid-page', 'Exact Scripture – God’s Word.')])
                self.assertEqual(connection.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            connection.close()
            restored_meta = Path(self.temporary.name) / 'restore-metadata.sqlite'
            restored_meta.write_bytes(saved.read('state/v3/d1/database/metadata.sqlite'))
            with sqlite3.connect(restored_meta) as connection:
                self.assertEqual(connection.execute('SELECT rowid,name FROM registry').fetchall(), [(42, 'local-d1')])
            connection.close()
            self.assertEqual(saved.read('media/assets/image.webp'), self.image.read_bytes())
            self.assertEqual(saved.read('media/audio/recording.opus'), b'original-opus-bytes')
            self.assertEqual(saved.read('imports/course/source.pptx'), b'original-private-pptx')
            self.assertIn(b'Stop ALL', saved.read('RESTORE.txt'))

    def test_control_database_alone_cannot_hide_missing_curriculum(self):
        self.writer.execute('DROP TABLE cms_pages')
        self.writer.commit()
        with sqlite3.connect(self.content.parent / 'control.sqlite') as connection:
            connection.execute('CREATE TABLE auth_user(id TEXT PRIMARY KEY)')
        connection.close()
        with self.assertRaisesRegex(backup.BackupError, 'No curriculum D1'):
            self.create()
        self.assert_no_completed_backup()

    def test_control_identity_and_permissions_are_backed_up_without_secret_configuration(self):
        control = self.content.parent / 'control.sqlite'
        with sqlite3.connect(control) as connection:
            connection.execute('CREATE TABLE auth_user(id TEXT PRIMARY KEY, email TEXT)')
            connection.execute('CREATE TABLE cms_grant(id TEXT PRIMARY KEY, user_id TEXT REFERENCES auth_user(id))')
            connection.execute('INSERT INTO auth_user VALUES (?,?)', ('test-user', 'private@example.test'))
            connection.execute('INSERT INTO cms_grant VALUES (?,?)', ('test-grant', 'test-user'))
        connection.close()
        secret = self.repo / 'services/api-worker/.dev.vars.auth'
        secret.write_text('BETTER_AUTH_SECRET=not-in-a-backup')
        result = self.create(compact=True)
        manifest = backup.verify_archive(Path(result['archive']))
        information = next(db for db in manifest['databases'] if db['path'].endswith('control.sqlite'))
        self.assertEqual(information['rowCounts'], {'auth_user': 1, 'cms_grant': 1})
        self.assertEqual(information['method'], 'vacuum-into')
        with zipfile.ZipFile(result['archive']) as saved:
            self.assertFalse(any('.dev.vars' in name for name in saved.namelist()))
            restored = Path(self.temporary.name) / 'restored-control.sqlite'
            restored.write_bytes(saved.read('state/v3/d1/database/control.sqlite'))
        with sqlite3.connect(restored) as connection:
            self.assertEqual(connection.execute('SELECT * FROM cms_grant').fetchall(), [('test-grant', 'test-user')])
        connection.close()

    def test_compact_uses_vacuum_into_only_for_curriculum_and_does_not_change_source(self):
        initial = backup.hash_file(self.content)
        result = self.create(compact=True)
        manifest = backup.verify_archive(Path(result['archive']))
        methods = {Path(item['path']).name: item['method'] for item in manifest['databases']}
        self.assertEqual(methods, {'content.sqlite': 'vacuum-into', 'metadata.sqlite': 'online-backup'})
        self.assertEqual(backup.hash_file(self.content), initial)
        self.assertEqual(self.writer.execute('SELECT text FROM cms_pages').fetchone()[0], 'Exact Scripture – God’s Word.')

    def test_windows_long_media_paths_are_streamed_into_zip_without_long_staging_paths(self):
        long_media = self.local / 'media' / ('a' * 90) / ('b' * 90) / ('c' * 90) / 'Spanish-illustration.webp'
        os.makedirs(backup.long_path(long_media.parent))
        with open(backup.long_path(long_media), 'wb') as writer:
            writer.write(b'long-path-media')
        self.assertGreater(len(str(long_media)), 260)
        result = self.create()
        with zipfile.ZipFile(result['archive']) as archive:
            self.assertEqual(archive.read(long_media.relative_to(self.local).as_posix()), b'long-path-media')
        backup.verify_archive(Path(result['archive']))

    def test_changed_media_aborts_without_publishing_an_archive(self):
        original = backup.stream_file

        def changing(archive, relative, source):
            record = original(archive, relative, source)
            if relative == 'media/assets/image.webp':
                self.image.write_bytes(b'edited-during-backup')
            return record
        with patch.object(backup, 'stream_file', changing), self.assertRaisesRegex(backup.BackupError, 'Source changed'):
            self.create()
        self.assert_no_completed_backup()
        self.assertEqual(self.image.read_bytes(), b'edited-during-backup')

    def test_curriculum_change_aborts_without_losing_the_new_edit(self):
        original = backup.stream_file

        def changing(archive, relative, source):
            record = original(archive, relative, source)
            if relative == 'media/assets/image.webp':
                self.writer.execute('INSERT INTO cms_pages VALUES (?,?)', ('new-page', 'New saved text'))
                self.writer.commit()
            return record
        with patch.object(backup, 'stream_file', changing), self.assertRaisesRegex(backup.BackupError, 'Content/control data changed'):
            self.create()
        self.assert_no_completed_backup()
        self.assertEqual(self.writer.execute('SELECT count(*) FROM cms_pages').fetchone()[0], 2)

    def test_added_media_aborts_and_preserves_source(self):
        original = backup.stream_file

        def adding(archive, relative, source):
            record = original(archive, relative, source)
            if relative == 'media/assets/image.webp':
                (self.image.parent / 'new.webp').write_bytes(b'new-file')
            return record
        with patch.object(backup, 'stream_file', adding), self.assertRaisesRegex(backup.BackupError, 'added/removed'):
            self.create()
        self.assert_no_completed_backup()
        self.assertTrue((self.image.parent / 'new.webp').exists())

    def test_missing_or_corrupt_databases_do_not_produce_completed_backups(self):
        with self.assertRaisesRegex(backup.BackupError, 'state is missing'):
            backup.create_backup(self.repo / 'missing', self.destination, announce=lambda _: None)
        (self.content.parent / 'corrupt.sqlite').write_bytes(b'not a SQLite file')
        with self.assertRaises(sqlite3.DatabaseError):
            self.create()
        self.assert_no_completed_backup()
        self.assertEqual(self.writer.execute('SELECT count(*) FROM cms_pages').fetchone()[0], 1)

    def test_destination_guard_and_default_folder_avoid_source_recursion_and_git_leaks(self):
        for destination in [self.local / 'media/backups', self.repo / 'public-backups', self.repo]:
            with self.assertRaisesRegex(backup.BackupError, 'ignored .wrangler/backups'):
                backup.create_backup(self.repo, destination, announce=lambda _: None)
        result = backup.create_backup(self.repo, announce=lambda _: None)
        self.assertEqual(Path(result['archive']).parent, self.local / 'backups')
        manifest = backup.verify_archive(Path(result['archive']))
        self.assertFalse(any('/backups/' in entry['path'] for entry in manifest['files']))

    def test_old_backups_are_preserved_and_verification_can_run_without_live_state(self):
        first = self.create()
        second = self.create()
        self.assertNotEqual(first['archive'], second['archive'])
        self.assertEqual(backup.hash_file(Path(first['archive'])), first['sha256'])
        process = subprocess.run([sys.executable, '-B', str(Path(backup.__file__)), '--repo-root', str(self.repo / 'does-not-exist'), '--verify', first['archive']], capture_output=True, text=True)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn('Verified 2 database snapshots', process.stdout)

    def test_tampered_archive_and_failed_verification_are_rejected(self):
        result = self.create()
        bad = Path(self.temporary.name) / 'tampered.zip'
        with zipfile.ZipFile(result['archive']) as original, zipfile.ZipFile(bad, 'w') as altered:
            for item in original.infolist():
                altered.writestr(item, b'changed image' if item.filename == 'media/assets/image.webp' else original.read(item.filename))
        with self.assertRaisesRegex(backup.BackupError, 'checksum mismatch'):
            backup.verify_archive(bad)
        empty_destination = self.destination / 'failed'
        with patch.object(backup, 'verify_archive', side_effect=backup.BackupError('Verification failed')):
            with self.assertRaisesRegex(backup.BackupError, 'Verification failed'):
                backup.create_backup(self.repo, empty_destination, announce=lambda _: None)
        self.assertEqual(list(empty_destination.iterdir()), [])

    def test_symlink_or_junction_is_not_followed(self):
        original = backup.linked
        with patch.object(backup, 'linked', lambda path: str(path).endswith('image.webp') or original(path)):
            with self.assertRaisesRegex(backup.BackupError, 'Symlink/junction'):
                self.create()
        self.assertFalse(self.destination.exists())


if __name__ == '__main__':
    unittest.main()
