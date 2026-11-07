import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { applyMigrations, loadMigrations } from "@/server/db/migrate.js";

const APPLIED_AT = new Date("2026-11-07T12:00:00Z");

describe("loadMigrations", () => {
    let migrationsDir: string;

    beforeEach(() => {
        migrationsDir = mkdtempSync(path.join(tmpdir(), "forja-migrations-"));
    });

    afterEach(() => {
        rmSync(migrationsDir, { recursive: true, force: true });
    });

    it("reads the .sql files sorted by file name, using the name without extension as id", () => {
        writeMigrationFile(migrationsDir, "0200_credentials.sql", "SELECT 2;");
        writeMigrationFile(migrationsDir, "0001_init.sql", "SELECT 1;");
        writeMigrationFile(migrationsDir, "README.md", "not a migration");

        const migrations = loadMigrations(migrationsDir);

        expect(migrations).toEqual([
            { id: "0001_init", sql: "SELECT 1;" },
            { id: "0200_credentials", sql: "SELECT 2;" },
        ]);
    });
});

describe("applyMigrations", () => {
    let sqlite: Database.Database;

    beforeEach(() => {
        sqlite = new Database(":memory:");
    });

    afterEach(() => {
        sqlite.close();
    });

    it("applies the migrations in the given order and returns the applied ids", () => {
        const migrations = [
            { id: "0001_create", sql: "CREATE TABLE steps (name TEXT NOT NULL);" },
            { id: "0002_insert", sql: "INSERT INTO steps (name) VALUES ('second');" },
        ];

        const appliedIds = applyMigrations(sqlite, migrations, APPLIED_AT);

        expect(appliedIds).toEqual(["0001_create", "0002_insert"]);
        expect(sqlite.prepare("SELECT name FROM steps").all()).toEqual([{ name: "second" }]);
    });

    it("records each applied migration with its application time", () => {
        applyMigrations(sqlite, [{ id: "0001_noop", sql: "SELECT 1;" }], APPLIED_AT);

        expect(sqlite.prepare("SELECT id, applied_at FROM _migrations").all()).toEqual([
            { id: "0001_noop", applied_at: "2026-11-07T12:00:00.000Z" },
        ]);
    });
});

function writeMigrationFile(directory: string, fileName: string, sql: string): void {
    writeFileSync(path.join(directory, fileName), sql);
}
