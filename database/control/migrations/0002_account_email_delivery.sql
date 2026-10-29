-- Platform identity emails are separate from provider curriculum and AI settings.
CREATE TABLE platform_email_settings (
 id TEXT PRIMARY KEY NOT NULL CHECK(id='account-email'),
 provider TEXT NOT NULL CHECK(provider IN ('preview','mailgun','cloudflare')),
 enabled INTEGER NOT NULL DEFAULT 0,
 from_email TEXT NOT NULL DEFAULT '', from_name TEXT NOT NULL DEFAULT 'NovoApps', reply_to TEXT NOT NULL DEFAULT '',
 mailgun_domain TEXT NOT NULL DEFAULT '', mailgun_region TEXT NOT NULL DEFAULT 'us',
 mailgun_secret TEXT, cloudflare_account_id TEXT NOT NULL DEFAULT '', cloudflare_secret TEXT,
 daily_limit INTEGER NOT NULL DEFAULT 100 CHECK(daily_limit BETWEEN 1 AND 1000),
 revision INTEGER NOT NULL DEFAULT 1, updated_by TEXT REFERENCES auth_user(id), updated_at INTEGER NOT NULL
);
CREATE TABLE platform_email_outbox (
 id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, settings_revision INTEGER NOT NULL,
 purpose TEXT NOT NULL, recipient_email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 payload TEXT, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','retry','sending','accepted','rejected','unknown','cancelled','expired')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, lease_until INTEGER,
 finished_at INTEGER, provider_reference TEXT, http_status INTEGER, error_code TEXT
);
CREATE INDEX platform_email_outbox_due ON platform_email_outbox(status,next_attempt_at);
CREATE INDEX platform_email_outbox_time ON platform_email_outbox(created_at,id);
