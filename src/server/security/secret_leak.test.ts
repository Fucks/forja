import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { text } from "node:stream/consumers";

import type { NodeRunState } from "@/engine/node_run_state.js";
import { createDockerAgentRuntime } from "@/integrations/agent_runtime/docker_agent_runtime.js";
import type { SecretBox } from "@/integrations/secrets/secret_box.js";
import {
    createSecretRedactor,
    type SecretRedactor,
} from "@/integrations/secrets/secret_redactor.js";
import { systemClock } from "@/lib/clock.js";
import { resolvePaths } from "@/lib/paths.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import { createCredentialService } from "@/server/credentials/credential_service.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { createAppFlowService } from "@/server/flows/app_flow_service.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import type { RunRepository } from "@/server/runs/run_repository.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createAppExecutor } from "@/server/runtime/app_executor.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import { createLogStore, type LogStore } from "@/server/runtime/log_store.js";
import { createAuditLog } from "@/server/security/audit_log.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { InMemoryFs } from "@/test/fakes/in_memory_fs.js";
import { assistantTextLine, resultLine } from "@/test/fixtures/stream_json_fixtures.js";
import { createTestDb } from "@/test/test_db.js";
import { createTestSecretBox } from "@/test/test_secrets.js";

const SECRET_VALUE = "sk-ant-api03-vazamento-proibido-0123456789";
const PROJECT_ID = "prj_vazamento";
const LEAKER_NODE_ID = "leaker";
const LOGS_DIR = "/srv/forja/logs";
const CONTAINER_ID = "c0ffee";
const NODE_SPACING_PX = 240;
const RUN_FINISHED_TIMEOUT_MS = 10_000;

interface LeakBed {
    database: DatabaseHandle;
    commands: FakeCommandRunner;
    logs: LogStore;
    redactor: SecretRedactor;
    secrets: SecretBox;
    dataDir: string;
}

describe("secrets of a run", () => {
    let bed: LeakBed;

    beforeEach(async () => {
        bed = createLeakBed();
        await useCredentialAsProjectDefault(bed, SECRET_VALUE);
        scriptAgentPrintingTheSecret(bed.commands);
    });

    afterEach(() => {
        bed.database.close();
        rmSync(bed.dataDir, { recursive: true, force: true });
    });

    it("never appear in the log file, even when the agent prints them", async () => {
        const nodeRunId = await runLeakerToTheEnd(bed);

        const logFile = await text(bed.logs.rawStream(nodeRunId));
        expect(logFile).toContain("o segredo é");
        expect(logFile).not.toContain(SECRET_VALUE);
    });

    it("never appear in the arguments of the commands the runtime runs", async () => {
        await runLeakerToTheEnd(bed);

        const everyArgument = bed.commands.calls.flatMap((call) => [call.command, ...call.args]);
        expect(everyArgument.some((argument) => argument.includes(SECRET_VALUE))).toBe(false);
        expect(claudeCallEnvValues(bed.commands)).toContain(SECRET_VALUE);
    });
});

function createLeakBed(): LeakBed {
    const database = createTestDb();
    new ProjectRepository(database.db).insert(buildProject({ id: PROJECT_ID }));
    const commands = new FakeCommandRunner();
    const redactor = createSecretRedactor();
    const logs = createLogStore({
        logsDir: LOGS_DIR,
        db: database.db,
        redactor,
        clock: systemClock,
        fs: new InMemoryFs(),
    });

    return {
        database,
        commands,
        logs,
        redactor,
        secrets: createTestSecretBox(),
        dataDir: mkdtempSync(path.join(tmpdir(), "forja-leak-")),
    };
}

async function useCredentialAsProjectDefault(bed: LeakBed, value: string): Promise<void> {
    const credential = await createCredentialService({
        repo: new CredentialRepository(bed.database.db),
        secrets: bed.secrets,
        redactor: bed.redactor,
        clock: systemClock,
        audit: createAuditLog({ db: bed.database.db, clock: systemClock }),
    }).create({ name: "Claude", kind: "anthropic_api_key", value });
    const settings = createSettingsService({
        repo: new SettingsRepository(bed.database.db),
        lookups: createSettingsLookups(bed.database.db),
        clock: systemClock,
    });
    const projectSettings = await settings.getProjectSettings(PROJECT_ID);

    await settings.saveProjectSettings(PROJECT_ID, {
        ...projectSettings,
        defaultCredentialId: credential.id,
    });
}

function scriptAgentPrintingTheSecret(commands: FakeCommandRunner): void {
    commands.when("git", () => true).returns({});
    commands.when("docker", () => true).returns({ stdout: `${CONTAINER_ID}\n` });
    commands.when("docker", isClaudeCall).returns({
        stdout: [assistantTextLine(`o segredo é ${SECRET_VALUE}`), resultLine()].join("\n"),
    });
}

async function runLeakerToTheEnd(bed: LeakBed): Promise<string> {
    const executor = createAppExecutor({
        db: bed.database.db,
        events: createEventBus(systemClock),
        logs: bed.logs,
        git: new FakeGitProvider(),
        commands: bed.commands,
        secrets: bed.secrets,
        redactor: bed.redactor,
        runtime: createDockerAgentRuntime({
            commands: bed.commands,
            paths: resolvePaths(bed.dataDir, bed.dataDir),
            clock: systemClock,
            hostUser: null,
        }),
        clock: systemClock,
    });
    const flowId = await publishLeakerFlow(bed);
    const run = await executor.startRun({ projectId: PROJECT_ID, flowId, itemIds: [] });

    return waitForLeakerToSucceed(bed, run.id);
}

async function publishLeakerFlow(bed: LeakBed): Promise<string> {
    const flows = createAppFlowService({
        db: bed.database.db,
        events: createEventBus(systemClock),
        clock: systemClock,
    });
    const flow = await flows.create(PROJECT_ID, { name: "Vazamento", graph: buildLeakerFlow() });
    await flows.publish(flow.id);

    return flow.id;
}

function buildLeakerFlow(): FlowGraph {
    const trigger = createNodeOfType("trigger", "trigger", { x: 0, y: 0 });
    const leaker = createNodeOfType("agent", LEAKER_NODE_ID, { x: NODE_SPACING_PX, y: 0 });
    const leakerConfig = {
        ...leaker.config,
        prompt: "Mostre o segredo",
        workspace: "none" as const,
    };

    return {
        schemaVersion: 1,
        nodes: [trigger, { ...leaker, config: leakerConfig }],
        edges: [],
        groups: [],
    };
}

async function waitForLeakerToSucceed(bed: LeakBed, runId: string): Promise<string> {
    const runs = new SqliteRunRepository(bed.database.db, systemClock);

    return vi.waitFor(
        async () => {
            const leaker = await findLeakerNodeRun(runs, runId);
            expect(leaker.status).toBe("SUCCEEDED");

            return leaker.id;
        },
        { timeout: RUN_FINISHED_TIMEOUT_MS },
    );
}

async function findLeakerNodeRun(runs: RunRepository, runId: string): Promise<NodeRunState> {
    const nodeRuns = await runs.listNodeRuns(runId);
    const leaker = nodeRuns.find((nodeRun) => nodeRun.nodeId === LEAKER_NODE_ID);
    if (!leaker) {
        throw new Error(`The run ${runId} has no NodeRun of ${LEAKER_NODE_ID} yet`);
    }

    return leaker;
}

function isClaudeCall(args: string[]): boolean {
    return args[0] === "exec" && args.includes("claude");
}

function claudeCallEnvValues(commands: FakeCommandRunner): string[] {
    const claudeCall = commands.calls.find((call) => isClaudeCall(call.args));

    return Object.values(claudeCall?.options.env ?? {}).filter((value) => value !== undefined);
}
