CREATE TABLE auth_user(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,email_verified INTEGER NOT NULL,image TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE auth_session(id TEXT PRIMARY KEY NOT NULL,expires_at INTEGER NOT NULL,token TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,ip_address TEXT,user_agent TEXT,user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE);
CREATE INDEX auth_session_user ON auth_session(user_id);
CREATE TABLE auth_account(id TEXT PRIMARY KEY NOT NULL,account_id TEXT NOT NULL,provider_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,access_token TEXT,refresh_token TEXT,id_token TEXT,access_token_expires_at INTEGER,refresh_token_expires_at INTEGER,scope TEXT,password TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX auth_account_user ON auth_account(user_id);
CREATE TABLE auth_verification(id TEXT PRIMARY KEY NOT NULL,identifier TEXT NOT NULL,value TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX auth_verification_identifier ON auth_verification(identifier);
-- A local, one-time owner claim. Never enable this endpoint on a hosted deployment.
CREATE TABLE platform_setup(id TEXT PRIMARY KEY CHECK(id='owner'),email TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE platform_admin(user_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE);
CREATE TABLE cms_invitation(id TEXT PRIMARY KEY NOT NULL,email TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,provider_id TEXT NOT NULL,course_id TEXT NOT NULL,locale TEXT NOT NULL,role TEXT NOT NULL CHECK(role='reviewer'),created_by TEXT NOT NULL REFERENCES auth_user(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,consumed_by TEXT REFERENCES auth_user(id),consumed_at INTEGER,revoked_at INTEGER);
CREATE TABLE cms_grant(id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,provider_id TEXT NOT NULL,course_id TEXT NOT NULL,locale TEXT NOT NULL,role TEXT NOT NULL CHECK(role='reviewer'),invitation_id TEXT NOT NULL UNIQUE REFERENCES cms_invitation(id));
CREATE INDEX cms_grant_user ON cms_grant(user_id);
-- No passwords, invitation tokens, keys, draft text or session tokens in audit records.
CREATE TABLE platform_audit(id TEXT PRIMARY KEY NOT NULL,actor_id TEXT REFERENCES auth_user(id),action TEXT NOT NULL,target TEXT NOT NULL,created_at INTEGER NOT NULL,status INTEGER);
CREATE INDEX platform_audit_actor_time ON platform_audit(actor_id,created_at);
