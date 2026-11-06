import { InvalidEnvError, loadEnv } from "@/lib/env.js";

describe("loadEnv", () => {
    it("applies the defaults when no variable is set", () => {
        const env = loadEnv({});

        expect(env).toEqual({
            FORJA_PORT: 4317,
            FORJA_HOST: "127.0.0.1",
            FORJA_AGENT_RUNTIME: "docker",
            FORJA_LOG_LEVEL: "info",
        });
    });

    it("reads the port and the data directory from the source", () => {
        const env = loadEnv({ FORJA_PORT: "5000", FORJA_DATA_DIR: "/tmp/forja" });

        expect(env.FORJA_PORT).toBe(5000);
        expect(env.FORJA_DATA_DIR).toBe("/tmp/forja");
    });

    it("rejects a port that is not a number with an error naming the variable", () => {
        const loadInvalidPort = (): unknown => loadEnv({ FORJA_PORT: "abc" });

        expect(loadInvalidPort).toThrow(InvalidEnvError);
        expect(loadInvalidPort).toThrow(/FORJA_PORT/);
    });

    it("rejects a port outside the valid range", () => {
        expect(() => loadEnv({ FORJA_PORT: "70000" })).toThrow(/FORJA_PORT/);
    });

    it("rejects any host other than 127.0.0.1", () => {
        expect(() => loadEnv({ FORJA_HOST: "0.0.0.0" })).toThrow(/FORJA_HOST/);
    });

    it("lists every invalid variable in the same error", () => {
        const loadTwoInvalidVariables = (): unknown =>
            loadEnv({ FORJA_PORT: "abc", FORJA_LOG_LEVEL: "verbose" });

        expect(loadTwoInvalidVariables).toThrow(/FORJA_PORT[\s\S]*FORJA_LOG_LEVEL/);
    });
});
