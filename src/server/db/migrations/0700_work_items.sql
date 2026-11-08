CREATE TABLE work_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    number INTEGER,
    url TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    labels_json TEXT NOT NULL,
    state TEXT NOT NULL,
    blocked_by_json TEXT NOT NULL,
    branch TEXT NOT NULL,
    manual_column TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced_at TEXT,
    UNIQUE (project_id, source, number)
);

CREATE INDEX work_items_project_id ON work_items (project_id);
