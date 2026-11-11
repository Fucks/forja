CREATE TABLE approvals (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
    node_run_id TEXT NOT NULL,
    work_item_id TEXT,
    message TEXT NOT NULL,
    show_json TEXT NOT NULL,
    diff TEXT,
    status TEXT NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    expires_at TEXT
);

CREATE INDEX approvals_project_id_status ON approvals (project_id, status);
CREATE INDEX approvals_node_run_id ON approvals (node_run_id);
