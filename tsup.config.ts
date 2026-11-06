import { copyFileSync, globSync, mkdirSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "tsup";

import { RUNTIME_ASSET_KINDS, RUNTIME_ASSET_SOURCE_DIRS } from "./src/lib/paths.js";
import type { RuntimeAssetKind } from "./src/lib/paths.js";

const OUT_DIR = "dist";

const RUNTIME_ASSET_FILE_PATTERNS: Record<RuntimeAssetKind, string> = {
    migrations: "*.sql",
    prompts: "**/prompts/*.md",
    assets: "**/*",
};

export default defineConfig({
    entry: ["src/cli.ts"],
    format: "esm",
    platform: "node",
    target: "node22",
    outDir: OUT_DIR,
    onSuccess: copyRuntimeAssets,
});

async function copyRuntimeAssets(): Promise<void> {
    for (const kind of RUNTIME_ASSET_KINDS) {
        copyRuntimeAssetFiles(kind);
    }
}

function copyRuntimeAssetFiles(kind: RuntimeAssetKind): void {
    const sourceDir = RUNTIME_ASSET_SOURCE_DIRS[kind];
    const targetDir = path.join(OUT_DIR, kind);

    for (const relativeFile of findFiles(sourceDir, RUNTIME_ASSET_FILE_PATTERNS[kind])) {
        const targetFile = path.join(targetDir, relativeFile);
        mkdirSync(path.dirname(targetFile), { recursive: true });
        copyFileSync(path.join(sourceDir, relativeFile), targetFile);
    }
}

function findFiles(directory: string, pattern: string): string[] {
    return globSync(pattern, { cwd: directory, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)));
}
