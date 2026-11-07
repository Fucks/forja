import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

const MIGRATION_EXTENSION = ".sql";

// The migrator reads this table before any migration runs, so it cannot wait for 0001_init.sql to
// create it; 0001_init.sql still declares it (IF NOT EXISTS) so every table appears in a migration.
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

export class MigrationFailedError extends Error {
    constructor(migrationId: string, cause: unknown) {
        const fileName = `${migrationId}${MIGRATION_EXTENSION}`;
        super(`Falha ao aplicar a migração ${fileName}: ${describeCause(cause)}`, { cause });
        this.name = "MigrationFailedError";
    }
}

export function loadMigrations(migrationsDir: string): Migration[] {
    return listMigrationFileNames(migrationsDir).map((fileName) => ({
        id: path.basename(fileName, MIGRATION_EXTENSION),
        sql: readFileSync(path.join(migrationsDir, fileName), "utf8"),
    }));
}

export function applyMigrations(
    sqlite: Database.Database,
    migrations: Migration[],
    now: Date,
): string[] {
    sqlite.exec(CREATE_MIGRATIONS_TABLE_SQL);
    const pendingMigrations = findPendingMigrations(sqlite, migrations);

    for (const migration of pendingMigrations) {
        applyMigrationInTransaction(sqlite, migration, now);
    }

    return pendingMigrations.map((migration) => migration.id);
}

function listMigrationFileNames(migrationsDir: string): string[] {
    return readdirSync(migrationsDir)
        .filter((fileName) => fileName.endsWith(MIGRATION_EXTENSION))
        .sort();
}

function findPendingMigrations(sqlite: Database.Database, migrations: Migration[]): Migration[] {
    const appliedIds = new Set(
        sqlite.prepare<[], string>("SELECT id FROM _migrations").pluck().all(),
    );

    return migrations.filter((migration) => !appliedIds.has(migration.id));
}

function applyMigrationInTransaction(
    sqlite: Database.Database,
    migration: Migration,
    now: Date,
): void {
    const applyAndRecord = sqlite.transaction(() => {
        sqlite.exec(migration.sql);
        sqlite
            .prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)")
            .run(migration.id, now.toISOString());
    });

    try {
        applyAndRecord();
    } catch (error) {
        throw new MigrationFailedError(migration.id, error);
    }
}

function describeCause(cause: unknown): string {
    if (cause instanceof Error) {
        return cause.message;
    }

    return String(cause);
}
