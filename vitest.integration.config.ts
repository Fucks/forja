import { defineConfig } from "vitest/config";

import unitTestConfig from "./vitest.config.js";

export default defineConfig({
    ...unitTestConfig,
    test: {
        ...unitTestConfig.test,
        include: ["src/**/*.integration.test.ts"],
        exclude: ["e2e/**", ".sandcastle/**", "node_modules/**"],
    },
});
