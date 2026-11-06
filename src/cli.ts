#!/usr/bin/env node
import { homedir } from "node:os";
import { parseArgs } from "node:util";

import open from "open";

import { loadEnv } from "@/lib/env.js";
import type { Env } from "@/lib/env.js";
import { ensureDataDirs, resolvePaths } from "@/lib/paths.js";
import { startServer } from "@/server/main.js";

interface CliFlags {
    port: string | undefined;
    dataDir: string | undefined;
    shouldOpenBrowser: boolean;
    seedDemo: boolean;
}

try {
    await runForja(process.argv.slice(2));
} catch (error) {
    console.error(describeStartupError(error));
    process.exitCode = 1;
}

async function runForja(args: string[]): Promise<void> {
    const flags = parseCliFlags(args);
    const env = loadEnv({ ...process.env, ...collectEnvOverrides(flags) });
    const paths = resolvePaths(env.FORJA_DATA_DIR, homedir());
    ensureDataDirs(paths);

    await startServer({ env, paths, options: { seedDemo: flags.seedDemo } });

    if (flags.shouldOpenBrowser) {
        await open(buildServerUrl(env));
    }
}

function parseCliFlags(args: string[]): CliFlags {
    const { values } = parseArgs({
        args,
        options: {
            port: { type: "string" },
            "data-dir": { type: "string" },
            "no-open": { type: "boolean", default: false },
            "seed-demo": { type: "boolean", default: false },
        },
    });

    return {
        port: values.port,
        dataDir: values["data-dir"],
        shouldOpenBrowser: !values["no-open"],
        seedDemo: values["seed-demo"],
    };
}

function collectEnvOverrides(flags: CliFlags): Record<string, string> {
    const overrides: Record<string, string> = {};
    if (flags.port !== undefined) {
        overrides.FORJA_PORT = flags.port;
    }
    if (flags.dataDir !== undefined) {
        overrides.FORJA_DATA_DIR = flags.dataDir;
    }

    return overrides;
}

function buildServerUrl(env: Env): string {
    return `http://${env.FORJA_HOST}:${env.FORJA_PORT}`;
}

function describeStartupError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return "Não foi possível iniciar a Forja.";
}
