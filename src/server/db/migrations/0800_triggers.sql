CREATE TABLE triggers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    flow_id TEXT NOT NULL REFERENCES flows (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    policy TEXT NOT NULL,
    item_selection TEXT NOT NULL,
    kind TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_fired_at TEXT
);

CREATE INDEX triggers_project_id ON triggers (project_id);

CREATE TABLE trigger_fires (
    id TEXT PRIMARY KEY,
    trigger_id TEXT NOT NULL REFERENCES triggers (id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    outcome TEXT NOT NULL,
    run_id TEXT,
    message TEXT,
    reason TEXT NOT NULL,
    item_ids_json TEXT NOT NULL
);

CREATE INDEX trigger_fires_trigger_id_at ON trigger_fires (trigger_id, at);
CREATE INDEX trigger_fires_outcome ON trigger_fires (outcome);
