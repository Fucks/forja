import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["src/test/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
        exclude: ["**/*.integration.test.ts", "e2e/**", ".sandcastle/**", "node_modules/**"],
        maxWorkers: readMaxWorkersFromEnvironment(),
    },
});

function readMaxWorkersFromEnvironment(): number | undefined {
    const maxWorkers = Number(process.env.VITEST_MAX_WORKERS);
    if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
        return undefined;
    }

    return maxWorkers;
}
