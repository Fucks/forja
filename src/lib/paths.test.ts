import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ensureDataDirs, resolvePaths } from "@/lib/paths.js";

describe("resolvePaths", () => {
    it("uses .forja inside the home directory when no data directory is given", () => {
        const paths = resolvePaths(undefined, "/home/ana");

        expect(paths).toEqual({
            root: path.join("/home/ana", ".forja"),
            database: path.join("/home/ana", ".forja", "forja.db"),
            logs: path.join("/home/ana", ".forja", "logs"),
            masterKey: path.join("/home/ana", ".forja", "master.key"),
            tmp: path.join("/home/ana", ".forja", "tmp"),
        });
    });

    it("uses the explicit data directory instead of the home directory", () => {
        const dataDir = path.resolve("/srv/forja-data");

        const paths = resolvePaths(dataDir, "/home/ana");

        expect(paths.root).toBe(dataDir);
        expect(paths.database).toBe(path.join(dataDir, "forja.db"));
    });

    it("turns a relative data directory into an absolute path", () => {
        const paths = resolvePaths("forja-data", "/home/ana");

        expect(paths.root).toBe(path.resolve("forja-data"));
    });

    it("keeps spaces in the data directory path", () => {
        const dataDir = path.resolve("/Users/Ana Maria/Forja Dados");

        const paths = resolvePaths(dataDir, "/home/ana");

        expect(paths.root).toBe(dataDir);
        expect(paths.logs).toBe(path.join(dataDir, "logs"));
    });
});

describe("ensureDataDirs", () => {
    let parentDir: string;

    beforeEach(() => {
        parentDir = mkdtempSync(path.join(tmpdir(), "forja paths "));
    });

    afterEach(() => {
        rmSync(parentDir, { recursive: true, force: true });
    });

    it("creates the root, logs and tmp directories", () => {
        const paths = resolvePaths(path.join(parentDir, "dados da forja"), "/home/ana");

        ensureDataDirs(paths);

        expect(existsSync(paths.root)).toBe(true);
        expect(existsSync(paths.logs)).toBe(true);
        expect(existsSync(paths.tmp)).toBe(true);
    });

    it("succeeds when the directories already exist", () => {
        const paths = resolvePaths(parentDir, "/home/ana");
        ensureDataDirs(paths);

        expect(() => ensureDataDirs(paths)).not.toThrow();
    });
});
