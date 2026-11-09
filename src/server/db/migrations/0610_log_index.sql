CREATE TABLE log_index (
    node_run_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    count INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX log_index_run_id ON log_index (run_id);
