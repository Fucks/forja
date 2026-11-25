import path from "node:path";

import type { AgentRunRequest } from "@/integrations/agent_runtime/agent_runtime.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { updateAgentConfig } from "@/test/factories/flow_graph_variations.js";
import { buildProject } from "@/test/factories/project_factory.js";
import {
    buildIssueSnapshot,
    ExecutorTestBed,
    TEST_CLAUDE_API_KEY,
    TEST_PROJECT_ID,
} from "@/test/executor_test_bed.js";

const ISSUE_1 = buildIssueSnapshot(1);
const GITHUB_TOKEN = "ghp_super-secret-token";
const REPO_OF_TEST_PROJECT = buildProject({ id: TEST_PROJECT_ID }).repoPath;
const PACKAGE_JSON_OF_TEST_PROJECT = path.join(REPO_OF_TEST_PROJECT, "package.json");

describe("executor tool profiles", () => {
    let bed: ExecutorTestBed;

    beforeEach(() => {
        bed = new ExecutorTestBed([ISSUE_1]);
    });

    afterEach(() => {
        bed.close();
    });

    async function runToTheEnd(flow = buildCanonicalFlow()): Promise<string> {
        const flowId = await bed.publishFlow(flow);
        const started = await bed.startRun(flowId);
        await bed.runUntilFinished(started.id);

        return started.id;
    }

    async function requestOf(runId: string, nodeId: string): Promise<AgentRunRequest> {
        const nodeRun = await bed.findNodeRun(runId, nodeId);
        const request = bed.runtime.requests.find(({ nodeRunId }) => nodeRunId === nodeRun.id);
        if (!request) {
            throw new Error(`The agent of ${nodeId} never ran`);
        }

        return request;
    }

    async function createProfileWithGithubMcp(): Promise<string> {
        const credential = await bed.credentials.create({
            name: "GitHub do bot",
            kind: "generic_env",
            value: GITHUB_TOKEN,
            envVar: "BOT_GITHUB_TOKEN",
        });
        const profile = await bed.toolProfiles.create({
            name: "GitHub",
            description: "",
            mcpServers: [
                {
                    name: "github",
                    command: "github-mcp",
                    args: [],
                    env: { GITHUB_TOKEN: `\${cred:${credential.id}}` },
                },
            ],
            allowedTools: [],
            disallowedTools: [],
            permissionMode: "acceptEdits",
            indexCodegraphOnStart: false,
        });

        return profile.id;
    }

    it("gives the two agents of the item the tool flags of their own profiles", async () => {
        const runId = await runToTheEnd();

        const developer = await requestOf(runId, "dev");
        const reviewer = await requestOf(runId, "reviewer");

        expect(developer.toolArgs).toEqual([
            "--mcp-config",
            "/home/agent/.forja/mcp-dev.json",
            "--strict-mcp-config",
            "--allowedTools",
            "mcp__codegraph__*",
        ]);
        expect(reviewer.toolArgs).toEqual([
            "--mcp-config",
            "/home/agent/.forja/mcp-reviewer.json",
            "--strict-mcp-config",
        ]);
    });

    it("applies the profile to a headless agent too", async () => {
        const runId = await runToTheEnd();

        const techLead = await requestOf(runId, "tl");

        expect(techLead.toolArgs).toContain("--strict-mcp-config");
        expect(techLead.toolArgs.slice(-4)).toEqual([
            "--disallowedTools",
            "Write",
            "Edit",
            "NotebookEdit",
        ]);
    });

    it("writes the MCP file of each node in the runtime dir and nothing in the worktree", async () => {
        const runId = await runToTheEnd();

        const developer = await requestOf(runId, "dev");

        expect(developer.runtimeFiles.map(({ containerPath }) => containerPath)).toEqual([
            "/home/agent/.forja/mcp-dev.json",
        ]);
        expect(bed.runtime.filesOf("workspace-1")).toEqual({});
    });

    it("passes the credential of an MCP through the env, never through a file", async () => {
        const profileId = await createProfileWithGithubMcp();
        const flow = updateAgentConfig(buildCanonicalFlow(), "dev", { toolProfileId: profileId });

        const runId = await runToTheEnd(flow);

        const developer = await requestOf(runId, "dev");
        expect(developer.env).toEqual({
            BOT_GITHUB_TOKEN: GITHUB_TOKEN,
            ANTHROPIC_API_KEY: TEST_CLAUDE_API_KEY,
        });
        expect(developer.permissionMode).toBe("acceptEdits");
        expect([...bed.runtime.runtimeFiles.values()].join("\n")).not.toContain(GITHUB_TOKEN);
    });

    it("sets up the item workspace for every profile that runs in it, once", async () => {
        bed.existingFiles.add(PACKAGE_JSON_OF_TEST_PROJECT);
        const flow = updateAgentConfig(buildCanonicalFlow(), "reviewer", {
            toolProfileId: "tlp_builtin_codegraph",
        });

        await runToTheEnd(flow);

        const [opened] = bed.runtime.openedSpecs;
        expect(opened?.setupCommands.map(({ command }) => command)).toEqual([
            "npm i",
            "codegraph init --yes",
        ]);
    });

    it("installs the dependencies with the package manager of the lockfile", async () => {
        bed.existingFiles.add(PACKAGE_JSON_OF_TEST_PROJECT);
        bed.existingFiles.add(path.join(REPO_OF_TEST_PROJECT, "pnpm-lock.yaml"));

        await runToTheEnd(buildCanonicalFlow());

        const [opened] = bed.runtime.openedSpecs;
        expect(opened?.setupCommands[0]?.command).toBe(
            "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install",
        );
    });
});
