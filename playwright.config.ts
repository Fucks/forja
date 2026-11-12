import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const FORJA_PORT = 4399;
const FORJA_URL = `http://127.0.0.1:${FORJA_PORT}`;
const BUILD_AND_START_TIMEOUT_MS = 180_000;
const SCENARIO_TIMEOUT_MS = 120_000;
const EXPECT_TIMEOUT_MS = 15_000;
const CI_RETRIES = 1;

export default defineConfig({
    testDir: "e2e",
    timeout: SCENARIO_TIMEOUT_MS,
    expect: { timeout: EXPECT_TIMEOUT_MS },
    // The scenarios share one server, and its agents share one concurrency limit.
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? CI_RETRIES : 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        ...devices["Desktop Chrome"],
        baseURL: FORJA_URL,
        viewport: { width: 1440, height: 900 },
        trace: "retain-on-failure",
    },
    webServer: {
        command: "npm run build && node dist/cli.js --no-open",
        url: `${FORJA_URL}/api/health`,
        timeout: BUILD_AND_START_TIMEOUT_MS,
        reuseExistingServer: false,
        env: {
            FORJA_DATA_DIR: e2eDataDir(),
            FORJA_AGENT_RUNTIME: "fake",
            FORJA_PORT: String(FORJA_PORT),
        },
    },
});

// Each worker loads this file again; the environment carries the directory made by the first load.
function e2eDataDir(): string {
    process.env.FORJA_E2E_DATA_DIR ??= mkdtempSync(path.join(tmpdir(), "forja-e2e-"));
    return process.env.FORJA_E2E_DATA_DIR;
}
