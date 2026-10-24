"""Prepare/rehearse a cloud import from a VERIFIED backup; never write live SQLite."""
import argparse, hashlib, importlib.util, json, os, sqlite3, tempfile, zipfile
from pathlib import Path
from contextlib import closing

CONTENT=('cms_providers','cms_courses','cms_modules','cms_pages','cms_page_revisions','cms_module_structures','cms_media_assets','cms_publications','cms_publication_leases','d1_migrations')
CONTROL=('auth_user','auth_account','auth_session','auth_verification','platform_setup','platform_admin','cms_invitation','cms_grant','platform_audit','cms_ai_settings','cms_ai_grant','cms_ai_activity','cms_ai_artifact','cms_ai_reconciliation_event','d1_migrations')
EPHEMERAL={'auth_session','auth_verification','cms_publication_leases'}
def digest(data):return hashlib.sha256(data).hexdigest()
def quote(name):return '"'+name.replace('"','""')+'"'
def rows(connection,table,omit_ephemeral=False):
    if omit_ephemeral and table in EPHEMERAL:return []
    values=[dict(row) for row in connection.execute('SELECT * FROM '+quote(table))]
    if omit_ephemeral and table=='cms_ai_settings':
        for row in values:
            for name in ['encrypted_key','key_nonce','key_version','credential_id']:row[name]=None
    # Self-referencing source records must precede their editions (D1 imports can
    # execute batches separately, so do not depend on a whole-file transaction).
    source={'cms_courses':'source_course_id','cms_modules':'source_module_id','cms_pages':'source_page_id'}.get(table)
    if source:
        ordered=[];seen=set()
        while values:
            ready=[row for row in values if not row.get(source) or row[source] in seen]
            if not ready:raise ValueError('Unresolved source dependency in '+table)
            ready.sort(key=lambda row:row['id']);ordered.extend(ready);seen.update(row['id'] for row in ready)
            values=[row for row in values if row not in ready]
        return ordered
    return sorted(values,key=lambda row:json.dumps(row,sort_keys=True,ensure_ascii=False))
def row_hash(values):return digest(json.dumps(values,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode())
def fingerprint(connection,tables,omit_ephemeral=False):
    return {table:{'rows':len(values),'sha256':row_hash(values)} for table in tables
            if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone()
            for values in [rows(connection,table,omit_ephemeral)]}
def sql_export(connection,tables):
    selected=[table for table in tables if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone()]
    output=['-- Private CMS import. Contains password hashes; never commit or publish.']
    for table in selected:output.append(connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone()[0]+';')
    for table in selected:
        for row in rows(connection,table,omit_ephemeral=True):
            values=','.join(connection.execute('SELECT quote(?)',(value,)).fetchone()[0] for value in row.values())
            output.append('INSERT INTO '+quote(table)+'('+','.join(quote(key) for key in row)+') VALUES('+values+');')
    for table in selected:
        for row in connection.execute("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL ORDER BY name",(table,)):output.append(row[0]+';')
    return '\n'.join(output)+'\n'
def prepare(repo,backup_file,destination):
    spec=importlib.util.spec_from_file_location('backup_cms',repo/'tooling/backup_cms.py');backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)
    verified=backup.verify_archive(backup_file)
    destination.mkdir(parents=True,exist_ok=False)
    manifest={'format':'novoapps-private-cloud-import-1','sourceBackup':str(backup_file.resolve()),'sourceBackupSha256':backup.hash_file(backup_file),'databases':{},'objects':[],'omittedData':sorted(EPHEMERAL)}
    with zipfile.ZipFile(backup_file) as archive:
        for label,tables,marker in [('content',CONTENT,'cms_pages'),('control',CONTROL,'auth_user')]:
            matches=[db for db in verified['databases'] if marker in db.get('rowCounts',{}) and db['path'].startswith('state/v3/d1/')]
            if len(matches)!=1:raise ValueError('Expected exactly one '+label+' database in the verified backup.')
            snapshot=destination/(label+'.sqlite');snapshot.write_bytes(archive.read(matches[0]['path']))
            with closing(sqlite3.connect(snapshot)) as connection:
                connection.row_factory=sqlite3.Row
                # Include new additive schema in the COPY only. Keep the archived
                # source snapshot and live authoring database untouched.
                applied={row[0] for row in connection.execute('SELECT name FROM d1_migrations')}
                for migration in sorted((repo/'database'/label/'migrations').glob('*.sql')):
                    if migration.name not in applied:
                        connection.executescript(migration.read_text(encoding='utf-8'))
                        connection.execute('INSERT INTO d1_migrations(name) VALUES(?)',(migration.name,));connection.commit()
                sql=sql_export(connection,tables)
                if any(len(line.encode())>95000 for line in sql.splitlines()):raise ValueError('D1 statement exceeds the safe import size; do not upload.')
                file=destination/(label+'.sql');file.write_text(sql,encoding='utf-8',newline='\n')
                expected=fingerprint(connection,tables,omit_ephemeral=True)
                with closing(sqlite3.connect(':memory:')) as restored:
                    restored.row_factory=sqlite3.Row;restored.execute('PRAGMA foreign_keys=ON');restored.executescript(sql)
                    if restored.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or restored.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('Restore rehearsal failed.')
                    if fingerprint(restored,tables)!=expected:raise ValueError('Restore changed table values.')
                manifest['databases'][label]={'file':file.name,'sha256':digest(file.read_bytes()),'tables':expected,'restoreRehearsal':'passed'}
        # Capture media from the SAME verified backup, not a changing live folder.
        for entry in verified['files']:
            name=entry['path']
            if not(name.startswith('media/assets/') or name.startswith('media/audio/')):continue
            data=archive.read(name);target=destination/'objects'/name;os.makedirs(backup.long_path(target.parent),exist_ok=True)
            with open(backup.long_path(target),'wb') as writer:writer.write(data)
            manifest['objects'].append({'key':name,'file':target.relative_to(destination).as_posix(),'bytes':len(data),'sha256':digest(data)})
    # Existing public legacy assets are already approved/public; stage private
    # copies for draft previews/publications without changing their bytes or URLs.
    for folder in ['assets','audio','icons']:
        for source in sorted((repo/'newvines-learning/public'/folder).rglob('*')):
            if not source.is_file():continue
            relative=source.relative_to(repo/'newvines-learning/public').as_posix();key='media/'+relative
            if any(item['key']==key for item in manifest['objects']):continue
            data=source.read_bytes();target=destination/'objects'/key;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
            manifest['objects'].append({'key':key,'file':target.relative_to(destination).as_posix(),'bytes':len(data),'sha256':digest(data)})
    (destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print('Prepared private import; SQLite restore rehearsals passed for content and control.')
    print('Excluded live sessions, verification tokens and publication leases. Canonical rows/IDs are preserved.')
    print(str(destination/'manifest.json'))
def verify_export(manifest_path,label,export):
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'));tables=CONTENT if label=='content' else CONTROL
    with closing(sqlite3.connect(':memory:')) as connection:
        connection.row_factory=sqlite3.Row;connection.executescript(export.read_text(encoding='utf-8-sig'))
        actual=fingerprint(connection,tables)
        if actual!=manifest['databases'][label]['tables']:raise ValueError('Remote table values differ from the prepared snapshot.')
        if connection.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('Remote foreign key validation failed.')
    print(label+': remote export matches every prepared row hash; foreign keys passed.')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--repo-root',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--backup',type=Path);parser.add_argument('--destination',type=Path);parser.add_argument('--verify-export',type=Path);parser.add_argument('--manifest',type=Path);parser.add_argument('--database',choices=['content','control']);args=parser.parse_args()
    try:
        if args.verify_export:verify_export(args.manifest,args.database,args.verify_export)
        elif args.backup and args.destination:
            allowed=(args.repo_root/'services/api-worker/.wrangler/cloud-imports').resolve();target=args.destination.resolve()
            if allowed not in target.parents:raise ValueError('Use a new private .wrangler/cloud-imports subfolder.')
            prepare(args.repo_root.resolve(),args.backup.resolve(),target)
        else:parser.error('Use --backup/--destination or --verify-export/--manifest/--database.')
    except Exception as error:raise SystemExit('Cloud preparation failed: '+str(error))
