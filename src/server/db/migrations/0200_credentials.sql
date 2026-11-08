CREATE TABLE credentials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    env_var TEXT NOT NULL,
    sealed_value TEXT NOT NULL,
    masked TEXT NOT NULL,
    last_checked_at TEXT,
    last_check_ok INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
