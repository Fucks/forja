import { execFileSync } from "node:child_process";

import type { NodeExecutionContext } from "@/server/runtime/node_executors.js";
import {
    buildScriptEnvironment,
    CommandRenderError,
    renderCommand,
} from "@/server/runtime/executors/script_environment.js";
import type { DataContext } from "@/shared/data_context.js";
import {
    type ScriptConfig,
    type ScriptEnvVar,
    scriptConfigSchema,
} from "@/shared/node_configs/script_config.js";
import { buildIssueSnapshot } from "@/test/executor_test_bed.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { buildNodeExecutionContext } from "@/test/factories/node_execution_context_factory.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildRunCredentials } from "@/test/factories/run_credentials_factory.js";

// Harmless payloads: if the quoting failed, the shell would only print an extra word.
const INJECTED = "echo injetado";
const ISSUE = buildIssueSnapshot(7);
const ITERATION = 2;

describe("renderCommand", () => {
    it("puts each value in single quotes, as a single argument", () => {
        const command = renderCommand("echo {{item.title}}", buildDataContext({ title: "Login" }));

        expect(command).toBe("echo 'Login'");
    });

    it.each([
        ["a single quote", `a'; ${INJECTED} #`],
        ["a command substitution", `$(${INJECTED})`],
        ["backticks", `\`${INJECTED}\``],
        ["a line break", `linha 1\n${INJECTED}`],
        ["a variable", "$HOME"],
    ])("keeps a value with %s literal in the shell", (_, title) => {
        const command = renderCommand("printf %s {{item.title}}", buildDataContext({ title }));

        expect(runInShell(command)).toBe(title);
    });

    it("writes numbers as they are and objects as JSON", () => {
        const data = buildDataContext({ number: 42 });

        const command = renderCommand("echo {{item.number}} {{project}}", data);

        expect(command).toBe(`echo '42' '${JSON.stringify(data.project, null, 2)}'`);
    });

    it("keeps an escaped opening as literal text", () => {
        const command = renderCommand("echo \\{{item.title}}", buildDataContext({ title: "x" }));

        expect(command).toBe("echo {{item.title}}");
    });

    it("fails with the variable that has no value", () => {
        const rendering = (): string => renderCommand("echo {{item.url}}", buildDataContext({}));

        expect(rendering).toThrow(CommandRenderError);
        expect(rendering).toThrow("Variável sem valor no comando: {{item.url}}");
    });
});

describe("buildScriptEnvironment", () => {
    it("always sets the run id, the base branch and the iteration", async () => {
        const context = buildScriptExecutionContext({ item: undefined });

        const env = await buildScriptEnvironment(context, configWith([]));

        expect(env).toEqual({
            FORJA_RUN_ID: context.run.id,
            FORJA_PROJECT_BASE_BRANCH: "main",
            FORJA_ITERATION: "2",
        });
    });

    it("sets the fields of the item when there is one", async () => {
        const context = buildScriptExecutionContext();

        const env = await buildScriptEnvironment(context, configWith([]));

        expect(env).toMatchObject({
            FORJA_ITEM_ID: ISSUE.id,
            FORJA_ITEM_NUMBER: "7",
            FORJA_ITEM_TITLE: ISSUE.title,
            FORJA_ITEM_BRANCH: ISSUE.branch,
            FORJA_ITEM_URL: ISSUE.url,
        });
    });

    it("sets the JSON of each input under its upper-case port name", async () => {
        const context = buildScriptExecutionContext({
            inputs: { review: { approved: true }, notes: "faltam testes" },
        });

        const env = await buildScriptEnvironment(context, configWith([]));

        expect(env).toMatchObject({
            FORJA_INPUT_REVIEW: '{"approved":true}',
            FORJA_INPUT_NOTES: '"faltam testes"',
        });
    });

    it("renders the {{...}} of a user variable without shell quotes", async () => {
        const context = buildScriptExecutionContext();

        const env = await buildScriptEnvironment(
            context,
            configWith([{ name: "ISSUE_LABEL", value: "#{{item.number}} {{item.title}}" }]),
        );

        expect(env.ISSUE_LABEL).toBe(`#7 ${ISSUE.title}`);
    });

    it("reads the value of a user variable from its credential", async () => {
        const context = buildScriptExecutionContext({
            credentials: buildRunCredentials({ crd_npm: "npm_secret_token" }),
        });

        const env = await buildScriptEnvironment(
            context,
            configWith([{ name: "NPM_TOKEN", credentialId: "crd_npm" }]),
        );

        expect(env.NPM_TOKEN).toBe("npm_secret_token");
    });

    it("lets a user variable replace a FORJA_ variable, except the run id", async () => {
        const context = buildScriptExecutionContext();

        const env = await buildScriptEnvironment(
            context,
            configWith([
                { name: "FORJA_ITEM_TITLE", value: "outro título" },
                { name: "FORJA_RUN_ID", value: "run_falso" },
            ]),
        );

        expect(env.FORJA_ITEM_TITLE).toBe("outro título");
        expect(env.FORJA_RUN_ID).toBe(context.run.id);
    });

    it("fails with the variable a user variable reads without a value", async () => {
        const context = buildScriptExecutionContext({ item: undefined });

        const building = buildScriptEnvironment(
            context,
            configWith([{ name: "TITLE", value: "{{item.title}}" }]),
        );

        await expect(building).rejects.toThrow("Variável sem valor no comando: {{item.title}}");
    });
});

function configWith(env: ScriptEnvVar[]): ScriptConfig {
    return scriptConfigSchema.parse({ command: "npm test", env });
}

function buildScriptExecutionContext(
    overrides: Partial<NodeExecutionContext> = {},
): NodeExecutionContext {
    const node = createNodeOfType("script", "tests", { x: 0, y: 0 });

    return buildNodeExecutionContext(node, {
        item: ISSUE,
        nodeRun: buildNodeRunState({ iteration: ITERATION, status: "RUNNING" }),
        ...overrides,
    });
}

function buildDataContext(item: Partial<NonNullable<DataContext["item"]>>): DataContext {
    return {
        inputs: {},
        nodes: {},
        item: { id: "itm_1", title: "", body: "", labels: [], ...item },
        project: { name: "Forja", baseBranch: "main" },
        run: { id: "run_1", iteration: 0, attempt: 1 },
    };
}

// The real shell is the judge of the quoting: what it prints is what the command received.
function runInShell(command: string): string {
    return execFileSync("sh", ["-c", command], { encoding: "utf8" });
}
