CREATE TABLE flows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    draft_json TEXT NOT NULL,
    draft_revision INTEGER NOT NULL,
    draft_updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX flows_project_id ON flows (project_id);

CREATE UNIQUE INDEX flows_one_default_per_project ON flows (project_id) WHERE is_default = 1;

CREATE TABLE flow_versions (
    flow_id TEXT NOT NULL REFERENCES flows (id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    graph_json TEXT NOT NULL,
    published_at TEXT NOT NULL,
    note TEXT,
    PRIMARY KEY (flow_id, version)
);
