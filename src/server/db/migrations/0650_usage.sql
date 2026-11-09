CREATE TABLE usage_records (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    flow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    node_run_id TEXT NOT NULL,
    work_item_id TEXT,
    iteration INTEGER NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL,
    cache_creation_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    price_estimated INTEGER NOT NULL,
    at TEXT NOT NULL
);

CREATE INDEX usage_records_project_id_at ON usage_records (project_id, at);

CREATE INDEX usage_records_run_id ON usage_records (run_id);
