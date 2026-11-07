import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { openDatabase } from "@/server/db/client.js";
import type { DatabaseHandle } from "@/server/db/client.js";

const PARENT_AND_CHILD_TABLES_SQL = `
    CREATE TABLE parents (id TEXT PRIMARY KEY);
    CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parents (id));
`;
const EXPECTED_BUSY_TIMEOUT_MS = 5000;

describe("openDatabase", () => {
    let workDir: string;
    let migrationsDir: string;
    let openHandles: DatabaseHandle[];

    beforeEach(() => {
        workDir = mkdtempSync(path.join(tmpdir(), "forja-db-"));
        migrationsDir = path.join(workDir, "migrations");
        mkdirSync(migrationsDir);
        openHandles = [];
        writeFileSync(path.join(migrationsDir, "0001_family.sql"), PARENT_AND_CHILD_TABLES_SQL);
    });

    afterEach(() => {
        for (const handle of openHandles) {
            handle.close();
        }
        rmSync(workDir, { recursive: true, force: true });
    });

    function open(filePath: string): DatabaseHandle {
        const handle = openDatabase(filePath, migrationsDir);
        openHandles.push(handle);
        return handle;
    }

    it("applies each migration only once when the same file is opened twice", () => {
        const databaseFile = path.join(workDir, "forja.db");
        open(databaseFile).close();

        const reopened = open(databaseFile);

        const appliedIds = reopened.sqlite.prepare("SELECT id FROM _migrations").pluck().all();
        expect(appliedIds).toEqual(["0001_family"]);
    });

    it("uses WAL journaling for a database file", () => {
        const handle = open(path.join(workDir, "forja.db"));

        expect(handle.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    });

    it("waits for locks before failing with SQLITE_BUSY", () => {
        const handle = open(":memory:");

        expect(handle.sqlite.pragma("busy_timeout", { simple: true })).toBe(
            EXPECTED_BUSY_TIMEOUT_MS,
        );
    });

    it("enforces foreign keys", () => {
        const handle = open(":memory:");

        const insertOrphan = (): unknown =>
            handle.sqlite
                .prepare("INSERT INTO children (id, parent_id) VALUES ('child', 'missing')")
                .run();

        expect(insertOrphan).toThrow(/FOREIGN KEY/);
    });

    it("refuses to open when a migration fails, citing the file", () => {
        writeFileSync(path.join(migrationsDir, "0002_broken.sql"), "NOT SQL;");

        expect(() => open(":memory:")).toThrow(/0002_broken\.sql/);
    });
});
