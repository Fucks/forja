import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

const MIGRATION_EXTENSION = ".sql";

// The migrator must know what was applied before the first migration runs, so it owns this table;
// 0001_init.sql repeats it with IF NOT EXISTS to keep the schema readable in one place.
const CREATE_MIGRATIONS_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
    )
`;

export interface Migration {
    id: string;
    sql: string;
}

export function loadMigrations(dir: string): Migration[] {
    return listMigrationFileNames(dir).map((fileName) => ({
        id: path.basename(fileName, MIGRATION_EXTENSION),
        sql: readFileSync(path.join(dir, fileName), "utf8"),
    }));
}

export function applyMigrations(
    sqlite: Database.Database,
    migrations: Migration[],
    now: Date,
): string[] {
    sqlite.exec(CREATE_MIGRATIONS_TABLE_SQL);

    for (const migration of migrations) {
        applyMigration(sqlite, migration, now);
    }

    return migrations.map((migration) => migration.id);
}

function listMigrationFileNames(dir: string): string[] {
    return readdirSync(dir)
        .filter((fileName) => fileName.endsWith(MIGRATION_EXTENSION))
        .sort();
}

function applyMigration(sqlite: Database.Database, migration: Migration, now: Date): void {
    sqlite.exec(migration.sql);
    sqlite
        .prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)")
        .run(migration.id, now.toISOString());
}
