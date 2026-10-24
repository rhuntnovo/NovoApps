import importlib.util,json,sqlite3,tempfile,unittest,zipfile
from contextlib import closing
from pathlib import Path

loader=importlib.util.spec_from_file_location('prepare_cloud',Path(__file__).resolve().parents[1]/'prepare_cms_cloud.py')
cloud=importlib.util.module_from_spec(loader);loader.loader.exec_module(cloud)

class CloudPreparationTest(unittest.TestCase):
 def test_source_dependencies_unicode_and_sql_literals_restore_without_rewording(self):
  with closing(sqlite3.connect(':memory:')) as source:
   source.row_factory=sqlite3.Row
   source.executescript('CREATE TABLE cms_courses(id TEXT PRIMARY KEY,source_course_id TEXT REFERENCES cms_courses(id),metadata_json TEXT);')
   exact='Scripture: God’s Word — no rewording.\nSpanish: “ahorro”; apostrophe: it\'s; <literal>.'
   source.execute('INSERT INTO cms_courses VALUES(?,?,?)',('z-primary',None,exact))
   source.execute('INSERT INTO cms_courses VALUES(?,?,?)',('a-edition','z-primary','Español — Nicaragua'))
   sql=cloud.sql_export(source,('cms_courses',))
   with closing(sqlite3.connect(':memory:')) as restored:
    restored.row_factory=sqlite3.Row;restored.execute('PRAGMA foreign_keys=ON');restored.executescript(sql)
    self.assertEqual(cloud.fingerprint(source,('cms_courses',)),cloud.fingerprint(restored,('cms_courses',)))
    self.assertEqual(restored.execute('SELECT metadata_json FROM cms_courses WHERE id=?',('z-primary',)).fetchone()[0],exact)
    self.assertIsNone(restored.execute('PRAGMA foreign_key_check').fetchone())
 def test_identity_is_preserved_but_live_sessions_and_verification_secrets_are_omitted(self):
  with closing(sqlite3.connect(':memory:')) as source:
   source.row_factory=sqlite3.Row
   source.executescript('CREATE TABLE auth_user(id TEXT PRIMARY KEY,email TEXT);CREATE TABLE auth_session(id TEXT PRIMARY KEY,token TEXT);CREATE TABLE auth_verification(id TEXT PRIMARY KEY,value TEXT);')
   source.execute('INSERT INTO auth_user VALUES(?,?)',('stable-user-id','test@example.test'))
   source.execute('INSERT INTO auth_session VALUES(?,?)',('test-session','session-value-must-not-transfer'))
   source.execute('INSERT INTO auth_verification VALUES(?,?)',('test-verification','verification-value-must-not-transfer'))
   sql=cloud.sql_export(source,('auth_user','auth_session','auth_verification'))
   self.assertNotIn('must-not-transfer',sql)
   with closing(sqlite3.connect(':memory:')) as restored:
    restored.row_factory=sqlite3.Row;restored.executescript(sql)
    self.assertEqual(restored.execute('SELECT count(*) FROM auth_session').fetchone()[0],0)
    self.assertEqual(restored.execute('SELECT count(*) FROM auth_verification').fetchone()[0],0)
    self.assertEqual(restored.execute('SELECT id FROM auth_user').fetchone()[0],'stable-user-id')
    expected=cloud.fingerprint(source,('auth_user','auth_session','auth_verification'),omit_ephemeral=True)
    self.assertEqual(expected,cloud.fingerprint(restored,('auth_user','auth_session','auth_verification')))
    restored.execute('INSERT INTO auth_session VALUES(?,?)',('unexpected','unexpected-session'))
    self.assertNotEqual(expected,cloud.fingerprint(restored,('auth_user','auth_session','auth_verification')))
 def test_cyclic_source_dependencies_fail_before_any_remote_execution(self):
  with closing(sqlite3.connect(':memory:')) as source:
   source.row_factory=sqlite3.Row;source.executescript('CREATE TABLE cms_pages(id TEXT PRIMARY KEY,source_page_id TEXT);')
   source.execute('INSERT INTO cms_pages VALUES(?,?)',('a','b'));source.execute('INSERT INTO cms_pages VALUES(?,?)',('b','a'))
   with self.assertRaisesRegex(ValueError,'Unresolved source dependency'):cloud.sql_export(source,('cms_pages',))

if __name__=='__main__':unittest.main()
