import { scriptConfigSchema, scriptEnvVarSchema } from "@/shared/node_configs/script_config.js";

describe("scriptConfigSchema", () => {
    it("reads a node saved before the new fields with the old behavior", () => {
        const config = scriptConfigSchema.parse({
            command: "npm test",
            timeoutMinutes: 10,
            workspace: "item",
        });

        expect(config).toEqual({
            command: "npm test",
            shell: "bash",
            runIn: "item",
            env: [],
            onFailure: "continue",
            parseOutput: "none",
            timeoutMinutes: 10,
        });
    });
});

describe("scriptEnvVarSchema", () => {
    it("accepts a variable with a value", () => {
        const parsing = scriptEnvVarSchema.safeParse({ name: "NODE_ENV", value: "test" });

        expect(parsing.success).toBe(true);
    });

    it("accepts a variable with a credential", () => {
        const parsing = scriptEnvVarSchema.safeParse({ name: "NPM_TOKEN", credentialId: "crd_1" });

        expect(parsing.success).toBe(true);
    });

    it("rejects a variable with both a value and a credential", () => {
        const parsing = scriptEnvVarSchema.safeParse({
            name: "NPM_TOKEN",
            value: "x",
            credentialId: "crd_1",
        });

        expect(parsing.success).toBe(false);
    });

    it("rejects a variable with neither a value nor a credential", () => {
        const parsing = scriptEnvVarSchema.safeParse({ name: "NPM_TOKEN" });

        expect(parsing.success).toBe(false);
    });

    it("rejects a name that is not an upper-case env variable name", () => {
        const parsing = scriptEnvVarSchema.safeParse({ name: "node-env", value: "test" });

        expect(parsing.success).toBe(false);
    });
});
