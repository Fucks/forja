CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX audit_log_created_at ON audit_log (created_at);
