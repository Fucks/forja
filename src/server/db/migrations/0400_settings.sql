CREATE TABLE project_settings (
    project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE global_settings (
    id TEXT PRIMARY KEY CHECK (id = 'global'),
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
