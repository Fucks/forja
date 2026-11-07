import { defineConfig } from "vitest/config";

import unitTestConfig from "./vitest.config.js";

export default defineConfig({
    ...unitTestConfig,
    test: {
        ...unitTestConfig.test,
        exclude: ["e2e/**", ".sandcastle/**", "node_modules/**"],
        projects: [
            {
                extends: true,
                test: {
                    name: "integration",
                    environment: "node",
                    include: ["src/**/*.integration.test.ts"],
                },
            },
        ],
    },
});
