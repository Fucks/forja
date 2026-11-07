import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const ALL_TEST_FILES = "src/**/*.test.{ts,tsx}";
const WEB_TEST_FILES = "src/web/**/*.test.{ts,tsx}";

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        globals: true,
        setupFiles: ["src/test/setup.ts"],
        exclude: ["**/*.integration.test.ts", "e2e/**", ".sandcastle/**", "node_modules/**"],
        maxWorkers: readMaxWorkersFromEnvironment(),
        projects: [
            {
                extends: true,
                test: {
                    name: "server",
                    environment: "node",
                    include: [ALL_TEST_FILES],
                    exclude: [WEB_TEST_FILES],
                },
            },
            {
                extends: true,
                test: { name: "web", environment: "jsdom", include: [WEB_TEST_FILES] },
            },
        ],
    },
});

function readMaxWorkersFromEnvironment(): number | undefined {
    const maxWorkers = Number(process.env.VITEST_MAX_WORKERS);
    if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
        return undefined;
    }

    return maxWorkers;
}
