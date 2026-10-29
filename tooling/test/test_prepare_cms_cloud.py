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
 def test_local_mail_preview_verification_is_not_trusted_by_hosted_imports(self):
  with closing(sqlite3.connect(':memory:')) as source:
   source.row_factory=sqlite3.Row
   source.executescript('CREATE TABLE auth_user(id TEXT PRIMARY KEY,email TEXT,email_verified INTEGER);')
   source.execute('INSERT INTO auth_user VALUES(?,?,?)',('stable-user-id','owner@example.test',1))
   sql=cloud.sql_export(source,('auth_user',))
   with closing(sqlite3.connect(':memory:')) as restored:
    restored.row_factory=sqlite3.Row;restored.executescript(sql)
    self.assertEqual(restored.execute('SELECT id FROM auth_user').fetchone()[0],'stable-user-id')
    self.assertEqual(restored.execute('SELECT email_verified FROM auth_user').fetchone()[0],0)
    self.assertEqual(source.execute('SELECT email_verified FROM auth_user').fetchone()[0],1)
    self.assertEqual(cloud.fingerprint(source,('auth_user',),omit_ephemeral=True),cloud.fingerprint(restored,('auth_user',)))

 def test_cyclic_source_dependencies_fail_before_any_remote_execution(self):
  with closing(sqlite3.connect(':memory:')) as source:
   source.row_factory=sqlite3.Row;source.executescript('CREATE TABLE cms_pages(id TEXT PRIMARY KEY,source_page_id TEXT);')
   source.execute('INSERT INTO cms_pages VALUES(?,?)',('a','b'));source.execute('INSERT INTO cms_pages VALUES(?,?)',('b','a'))
   with self.assertRaisesRegex(ValueError,'Unresolved source dependency'):cloud.sql_export(source,('cms_pages',))

 def test_ai_key_ciphertext_is_excluded_from_cloud_copy_but_usage_and_identity_are_preserved(self):
  with closing(sqlite3.connect(':memory:')) as source:
   source.row_factory=sqlite3.Row
   source.executescript('CREATE TABLE cms_ai_settings(provider_id TEXT PRIMARY KEY,encrypted_key TEXT,key_nonce TEXT,key_version TEXT,credential_id TEXT,project_id TEXT);CREATE TABLE cms_ai_activity(id TEXT PRIMARY KEY,request_id TEXT,usage_json TEXT);')
   source.execute('INSERT INTO cms_ai_settings VALUES(?,?,?,?,?,?)',('provider-id','private-ciphertext','private-nonce','v1','key-reference','proj_test'))
   source.execute('INSERT INTO cms_ai_activity VALUES(?,?,?)',('stable-activity-id','req_test','{"input_tokens":123}'))
   sql=cloud.sql_export(source,('cms_ai_settings','cms_ai_activity'))
   self.assertNotIn('private-ciphertext',sql)
   self.assertNotIn('private-nonce',sql)
   with closing(sqlite3.connect(':memory:')) as restored:
    restored.row_factory=sqlite3.Row;restored.executescript(sql)
    self.assertIsNone(restored.execute('SELECT encrypted_key FROM cms_ai_settings').fetchone()[0])
    self.assertEqual(restored.execute('SELECT request_id FROM cms_ai_activity').fetchone()[0],'req_test')
    self.assertEqual(cloud.fingerprint(source,('cms_ai_settings','cms_ai_activity'),omit_ephemeral=True),cloud.fingerprint(restored,('cms_ai_settings','cms_ai_activity')))

 def test_email_credentials_and_queued_bearer_messages_never_transfer_to_cloud(self):
  with closing(sqlite3.connect(':memory:')) as source:
   source.row_factory=sqlite3.Row
   source.executescript('CREATE TABLE platform_email_settings(id TEXT PRIMARY KEY,provider TEXT,enabled INTEGER,mailgun_secret TEXT,cloudflare_secret TEXT);CREATE TABLE platform_email_outbox(id TEXT PRIMARY KEY,payload TEXT);')
   source.execute('INSERT INTO platform_email_settings VALUES(?,?,?,?,?)',('account-email','mailgun',1,'private-mailgun-cipher','private-cloudflare-cipher'))
   source.execute('INSERT INTO platform_email_outbox VALUES(?,?)',('stable-message-id','private-message-cipher'))
   tables=('platform_email_settings','platform_email_outbox');sql=cloud.sql_export(source,tables)
   self.assertNotIn('private-',sql)
   with closing(sqlite3.connect(':memory:')) as restored:
    restored.row_factory=sqlite3.Row;restored.executescript(sql)
    row=restored.execute('SELECT * FROM platform_email_settings').fetchone()
    self.assertEqual(row['provider'],'preview');self.assertEqual(row['enabled'],0)
    self.assertIsNone(row['mailgun_secret']);self.assertIsNone(row['cloudflare_secret'])
    self.assertEqual(restored.execute('SELECT count(*) FROM platform_email_outbox').fetchone()[0],0)
    self.assertEqual(cloud.fingerprint(source,tables,omit_ephemeral=True),cloud.fingerprint(restored,tables))

if __name__=='__main__':unittest.main()
