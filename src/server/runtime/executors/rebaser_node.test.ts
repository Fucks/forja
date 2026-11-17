import {
    buildRebaserNode,
    nodesThatRunAgents,
    REBASER_MAX_ITERATIONS,
} from "@/server/runtime/executors/rebaser_node.js";
import { loadRunCredentials } from "@/server/runtime/run_credentials.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { gitConfigSchema, type GitConfig } from "@/shared/node_configs/git_config.js";
import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";

const POSITION = { x: 0, y: 0 };
const PROJECT_CREDENTIAL_ID = "cred_project";
const PROJECT_API_KEY = "sk-ant-api03-project-key";

describe("buildRebaserNode", () => {
    it("runs the rebase prompt in the item workspace until the agent says it is complete", () => {
        const rebaser = buildRebaserNode(buildGitNode("rebase", { action: "rebase" }));

        expect(rebaser.config).toMatchObject({
            workspace: "item",
            maxIterations: REBASER_MAX_ITERATIONS,
            completionSignal: "<promise>COMPLETE</promise>",
        });
        expect(rebaser.config.prompt).toContain("git rebase --continue");
    });

    it("leaves model, effort, credential and tool profile to the project defaults", () => {
        const rebaser = buildRebaserNode(buildGitNode("rebase", { action: "rebase" }));

        expect(rebaser.config.model).toBeUndefined();
        expect(rebaser.config.effort).toBeUndefined();
        expect(rebaser.config.credentialId).toBeUndefined();
        expect(rebaser.config.toolProfileId).toBeUndefined();
    });
});

describe("nodesThatRunAgents", () => {
    it("adds a rebaser for each git node that rebases", () => {
        const developer = createNodeOfType("agent", "dev", POSITION);
        const rebase = buildGitNode("rebase", { action: "rebase" });

        const nodes = nodesThatRunAgents(buildGraph([developer, rebase]));

        expect(nodes.map((node) => node.id)).toEqual(["dev", "rebase"]);
    });

    it("leaves out the git nodes that push or open pull requests", () => {
        const push = buildGitNode("push", { action: "push" });
        const openPr = buildGitNode("pr", { action: "open_pr" });

        const nodes = nodesThatRunAgents(buildGraph([push, openPr]));

        expect(nodes).toEqual([]);
    });
});

describe("loadRunCredentials of a flow whose only agent is a rebaser", () => {
    it("reveals the project credential for the rebaser", async () => {
        const rebase = buildGitNode("rebase", { action: "rebase" });
        const settings = {
            ...DEFAULT_PROJECT_SETTINGS,
            defaultCredentialId: PROJECT_CREDENTIAL_ID,
        };
        const revealForRuntime = vi.fn().mockResolvedValue({
            kind: "anthropic_api_key",
            envVar: "ANTHROPIC_API_KEY",
            value: PROJECT_API_KEY,
        });

        const credentials = await loadRunCredentials(
            { graph: buildGraph([rebase]), settings },
            { credentials: { revealForRuntime }, redactor: { register: () => undefined } },
        );

        expect(credentials.claudeCredentialOf(buildRebaserNode(rebase))).toEqual({
            kind: "anthropic_api_key",
            value: PROJECT_API_KEY,
        });
    });
});

function buildGitNode(id: string, config: Partial<GitConfig>) {
    const node = createNodeOfType("git", id, POSITION);
    return { ...node, config: gitConfigSchema.parse(config) };
}

function buildGraph(nodes: FlowNode[]): FlowGraph {
    return { schemaVersion: 2, nodes, edges: [], groups: [] };
}
