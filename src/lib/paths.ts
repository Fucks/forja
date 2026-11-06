import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATA_DIR_NAME = ".forja";
const TYPESCRIPT_EXTENSION = ".ts";

export interface ForjaPaths {
    root: string;
    database: string;
    logs: string;
    masterKey: string;
    tmp: string;
}

export type RuntimeAssetKind = "migrations" | "prompts" | "assets";

export type RuntimeAssetResolver = (kind: RuntimeAssetKind, ...segments: string[]) => string;

// In the bundle every kind is a folder next to dist/cli.js; tsup.config.ts copies them from here.
export const RUNTIME_ASSET_SOURCE_DIRS: Record<RuntimeAssetKind, string> = {
    migrations: path.join("src", "server", "db", "migrations"),
    prompts: path.join("src", "server"),
    assets: "assets",
};

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

export function createRuntimeAssetResolver(moduleFile: string): RuntimeAssetResolver {
    if (moduleFile.endsWith(TYPESCRIPT_EXTENSION)) {
        const repositoryRoot = findRepositoryRoot(moduleFile);
        return (kind, ...segments) =>
            path.join(repositoryRoot, RUNTIME_ASSET_SOURCE_DIRS[kind], ...segments);
    }

    const bundleDir = path.dirname(moduleFile);
    return (kind, ...segments) => path.join(bundleDir, kind, ...segments);
}

export const runtimeAssetPath = createRuntimeAssetResolver(fileURLToPath(import.meta.url));

function findRepositoryRoot(pathsModuleFile: string): string {
    const libDir = path.dirname(pathsModuleFile);
    return path.resolve(libDir, "..", "..");
}
