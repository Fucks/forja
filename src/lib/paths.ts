import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_DATA_DIR_NAME = ".forja";

export interface ForjaPaths {
    root: string;
    database: string;
    logs: string;
    masterKey: string;
    tmp: string;
}

export function resolvePaths(dataDir: string | undefined, homeDir: string): ForjaPaths {
    const root = dataDir ? path.resolve(dataDir) : path.join(homeDir, DEFAULT_DATA_DIR_NAME);

    return {
        root,
        database: path.join(root, "forja.db"),
        logs: path.join(root, "logs"),
        masterKey: path.join(root, "master.key"),
        tmp: path.join(root, "tmp"),
    };
}

export function ensureDataDirs(paths: ForjaPaths): void {
    for (const directory of [paths.root, paths.logs, paths.tmp]) {
        mkdirSync(directory, { recursive: true });
    }
}
