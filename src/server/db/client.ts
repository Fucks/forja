import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { runtimeAssetPath } from "@/lib/paths.js";
import { applyMigrations, loadMigrations } from "@/server/db/migrate.js";

export const IN_MEMORY_DATABASE = ":memory:";
const BUSY_TIMEOUT_MS = 5000;

export type ForjaDb = BetterSQLite3Database;

export interface DatabaseHandle {
    db: ForjaDb;
    sqlite: Database.Database;
    close(): void;
}

export function openDatabase(
    filePath: string,
    migrationsDir: string = runtimeAssetPath("migrations"),
): DatabaseHandle {
    const sqlite = new Database(filePath);

    try {
        configureConnection(sqlite, filePath);
        applyMigrations(sqlite, loadMigrations(migrationsDir), new Date());
    } catch (error) {
        sqlite.close();
        throw error;
    }

    return { db: drizzle(sqlite), sqlite, close: () => sqlite.close() };
}

function configureConnection(sqlite: Database.Database, filePath: string): void {
    // WAL needs a file on disk; an in-memory database always stays in "memory" journal mode.
    if (filePath !== IN_MEMORY_DATABASE) {
        sqlite.pragma("journal_mode = WAL");
    }
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
}
