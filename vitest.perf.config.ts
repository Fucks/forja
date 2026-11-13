import { defineConfig } from "vitest/config";

import unitTestConfig from "./vitest.config.js";

const WEB_PERF_TEST_FILES = "src/web/**/*.perf.test.{ts,tsx}";

// Timings are only meaningful when a perf test does not share the CPU with other test files.
export default defineConfig({
    ...unitTestConfig,
    test: {
        ...unitTestConfig.test,
        exclude: ["e2e/**", ".sandcastle/**", "node_modules/**"],
        fileParallelism: false,
        projects: [
            {
                extends: true,
                test: {
                    name: "perf-server",
                    environment: "node",
                    include: ["src/**/*.perf.test.ts"],
                    exclude: [WEB_PERF_TEST_FILES],
                },
            },
            {
                extends: true,
                test: { name: "perf-web", environment: "jsdom", include: [WEB_PERF_TEST_FILES] },
            },
        ],
    },
});
