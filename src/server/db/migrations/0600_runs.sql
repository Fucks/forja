CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    flow_id TEXT NOT NULL,
    flow_version INTEGER NOT NULL,
    status TEXT NOT NULL,
    pause_reason TEXT,
    resume_at TEXT,
    trigger_id TEXT,
    item_ids_json TEXT NOT NULL,
    failed_item_ids_json TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
);

CREATE INDEX runs_project_id_created_at ON runs (project_id, created_at DESC);

CREATE TABLE node_runs (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    work_item_id TEXT,
    iteration INTEGER NOT NULL,
    attempt INTEGER NOT NULL,
    group_path_json TEXT NOT NULL,
    status TEXT NOT NULL,
    error_json TEXT,
    inputs_json TEXT,
    outputs_json TEXT,
    queued_at TEXT,
    started_at TEXT,
    finished_at TEXT
);

CREATE INDEX node_runs_run_id ON node_runs (run_id);

CREATE INDEX node_runs_work_item_id_started_at ON node_runs (work_item_id, started_at);

CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
    node_run_id TEXT NOT NULL REFERENCES node_runs (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    value_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX artifacts_node_run_id ON artifacts (node_run_id);

CREATE TABLE run_snapshots (
    run_id TEXT PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
