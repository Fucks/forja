import { NotFoundError } from "@/server/errors.js";
import { loadRunCredentials } from "@/server/runtime/run_credentials.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { scriptConfigSchema } from "@/shared/node_configs/script_config.js";
import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";

const NPM_CREDENTIAL_ID = "crd_npm";
const NPM_TOKEN = "npm_0123456789abcdef";

describe("loadRunCredentials of a flow with a script that reads a credential", () => {
    it("reveals the credential of the script env and masks it in the logs", async () => {
        const revealForRuntime = vi.fn().mockResolvedValue({
            kind: "generic_env",
            envVar: "NPM_TOKEN",
            value: NPM_TOKEN,
        });
        const register = vi.fn();

        const credentials = await loadRunCredentials(
            { graph: buildScriptGraph(), settings: DEFAULT_PROJECT_SETTINGS },
            { credentials: { revealForRuntime }, redactor: { register } },
        );

        expect(credentials.credentialValueOf(NPM_CREDENTIAL_ID)).toBe(NPM_TOKEN);
        expect(revealForRuntime).toHaveBeenCalledWith(NPM_CREDENTIAL_ID);
        expect(register).toHaveBeenCalledWith(NPM_TOKEN);
    });

    it("refuses a credential that no script of the flow reads", async () => {
        const credentials = await loadRunCredentials(
            { graph: buildScriptGraph(), settings: DEFAULT_PROJECT_SETTINGS },
            {
                credentials: { revealForRuntime: vi.fn().mockResolvedValue({ value: NPM_TOKEN }) },
                redactor: { register: () => undefined },
            },
        );

        expect(() => credentials.credentialValueOf("crd_other")).toThrow(NotFoundError);
    });
});

function buildScriptGraph(): FlowGraph {
    const script = createNodeOfType("script", "publish", { x: 0, y: 0 });
    const config = scriptConfigSchema.parse({
        command: "npm publish",
        env: [{ name: "NPM_TOKEN", credentialId: NPM_CREDENTIAL_ID }],
    });

    return { schemaVersion: 2, nodes: [{ ...script, config }], edges: [], groups: [] };
}
