CREATE TABLE tool_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    mcp_servers_json TEXT NOT NULL,
    allowed_tools_json TEXT NOT NULL,
    disallowed_tools_json TEXT NOT NULL,
    permission_mode TEXT NOT NULL,
    index_codegraph_on_start INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
