import { existsSync } from "node:fs";

import type { NodeRunState } from "@/engine/node_run_state.js";
import { RUN_TERMINAL } from "@/engine/run_state.js";
import type { OpenWorkspaceSummary } from "@/integrations/agent_runtime/agent_runtime.js";
import {
    createSecretRedactor,
    maskSecret,
    type SecretRedactor,
} from "@/integrations/secrets/secret_redactor.js";
import { newId } from "@/lib/ids.js";
import type { AppDeps } from "@/server/app.js";
import { ApprovalRepository } from "@/server/approvals/approval_repository.js";
import {
    type ApprovalService,
    createApprovalService,
} from "@/server/approvals/approval_service.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import {
    createCredentialService,
    type CredentialService,
} from "@/server/credentials/credential_service.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { createFlowService, type FlowService } from "@/server/flows/flow_service.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import type { RunRecord, RunTransition } from "@/server/runs/run_repository.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createEventBus, type EventBus } from "@/server/runtime/event_bus.js";
import { createExecutor, type Executor, type ItemSource } from "@/server/runtime/executor.js";
import type { LogStore } from "@/server/runtime/log_store.js";
import { createOutputExecutor } from "@/server/runtime/executors/output_executor.js";
import { nodeExecutors, type NodeExecutorRegistry } from "@/server/runtime/node_executors.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService, type SettingsService } from "@/server/settings/settings_service.js";
import { ToolProfileRepository } from "@/server/tool_profiles/tool_profile_repository.js";
import {
    createToolProfileService,
    type ToolProfileService,
} from "@/server/tool_profiles/tool_profile_service.js";
import { createAppUsageService } from "@/server/usage/app_usage_service.js";
import type { UsageService } from "@/server/usage/usage_service.js";
import type { ForjaEvent } from "@/shared/events.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { ENV_VAR_BY_KIND } from "@/shared/credential_types.js";
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from "@/shared/settings_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { FakeAgentRuntime } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";
import { createTestLogStore } from "@/test/test_log_store.js";
import { createTestSecretBox } from "@/test/test_secrets.js";

export const TEST_PROJECT_ID = "prj_forja";
export const PROJECT_SYSTEM_PROMPT = "Escreva testes antes do código.";
export const TEST_CLAUDE_API_KEY = "sk-ant-api03-test-bed-abcdefghijklmnop-a1b2";

const TEST_CLAUDE_CREDENTIAL_ID = "cred_test_bed_claude";
const SEEDED_AT = "2026-01-01T00:00:00.000Z";

const TIME_STEP_MS = 1_000;
const MAX_DRIVEN_MS = 6 * 60 * 60 * 1_000;

// The source reads work items the test bed does not store; the git node gets its executor in #79.
const NOT_YET_IMPLEMENTED_EXECUTORS: NodeExecutorRegistry = {
    source: (context) => Promise.resolve({ outputs: { items: context.inputs.trigger } }),
    git: () => Promise.resolve({ outputs: { result: {} } }),
};

// What the run saved and what it published, in the order it happened.
export type JournalEntry =
    | { kind: "saved"; nodeRuns: NodeRunState[]; runStatus?: string }
    | { kind: "published"; event: ForjaEvent };

// What a restarted server finds: the database and the workspaces the previous process left open.
interface PreviousProcess {
    database: DatabaseHandle;
    stoppedAt: Date;
    openWorkspaces: OpenWorkspaceSummary[];
}

export class ExecutorTestBed {
    readonly clock: FakeClock;
    readonly runtime: FakeAgentRuntime;
    readonly events: EventBus;
    readonly logs: LogStore;
    readonly journal: JournalEntry[] = [];
    readonly runs: JournalingRunRepository;
    readonly flows: FlowService;
    readonly settings: SettingsService;
    readonly usage: UsageService;
    readonly approvals: ApprovalService;
    readonly toolProfiles: ToolProfileService;
    readonly credentials: CredentialService;
    readonly redactor: SecretRedactor = createSecretRedactor();
    // The repository of the test project has a package.json only when a test says so.
    readonly existingFiles = new Set<string>();
    readonly executor: Executor;
    private readonly database: DatabaseHandle;

    constructor(
        private readonly items: WorkItemSnapshot[],
        previous?: PreviousProcess,
    ) {
        this.clock = new FakeClock(previous?.stoppedAt);
        this.runtime = new FakeAgentRuntime({
            clock: this.clock,
            openWorkspaces: previous?.openWorkspaces,
        });
        this.events = createEventBus(this.clock);
        this.database = previous?.database ?? createDatabaseWithProject();
        this.logs = createTestLogStore(this.database.db, this.clock, this.redactor);
        this.runs = new JournalingRunRepository(this.database, this.clock, this.journal);
        this.flows = this.createFlowService();
        this.settings = this.createSettingsService();
        this.usage = createAppUsageService({
            db: this.database.db,
            settings: this.settings,
            clock: this.clock,
        });
        this.approvals = createApprovalService({
            repo: new ApprovalRepository(this.database.db),
            events: this.events,
            clock: this.clock,
        });
        this.toolProfiles = createToolProfileService({
            repo: new ToolProfileRepository(this.database.db),
            clock: this.clock,
        });
        this.credentials = createCredentialService({
            repo: new CredentialRepository(this.database.db),
            secrets: createTestSecretBox(),
            redactor: this.redactor,
            clock: this.clock,
        });
        this.events.subscribe((envelope) => {
            this.journal.push({ kind: "published", event: envelope.event });
        });
        this.executor = this.createExecutor();
    }

    close(): void {
        this.database.close();
    }

    // The app over the same database, executor and events, so the test drives it with the clock.
    buildAppDeps(): AppDeps {
        return createTestAppDeps(this.database.db, {
            executor: this.executor,
            events: this.events,
            logs: this.logs,
        });
    }

    // The old executor is abandoned with its clock, so nothing it started ever reports back.
    async restartServer(): Promise<ExecutorTestBed> {
        return new ExecutorTestBed(this.items, {
            database: this.database,
            stoppedAt: this.clock.now(),
            openWorkspaces: await this.runtime.listOpenWorkspaces(),
        });
    }

    async publishFlow(graph: FlowGraph): Promise<string> {
        const flow = await this.flows.create(TEST_PROJECT_ID, { name: "Entrega", graph });
        await this.flows.publish(flow.id);

        return flow.id;
    }

    useProjectSystemPrompt(systemPrompt: string): Promise<void> {
        return this.changeProjectSettings({ systemPrompt });
    }

    async changeProjectSettings(changes: Partial<ProjectSettings>): Promise<void> {
        const current = await this.settings.getProjectSettings(TEST_PROJECT_ID);
        await this.settings.saveProjectSettings(TEST_PROJECT_ID, { ...current, ...changes });
    }

    startRun(flowId: string): Promise<RunRecord> {
        const itemIds = this.items.map((item) => item.id);
        return this.executor.startRun({ projectId: TEST_PROJECT_ID, flowId, itemIds });
    }

    async runUntilFinished(runId: string): Promise<RunRecord> {
        await this.advanceUntil(async () => RUN_TERMINAL.has((await this.findRun(runId)).status));

        return this.findRun(runId);
    }

    // Advances the fake clock one step at a time, letting the executor react between steps.
    async advanceUntil(isDone: () => Promise<boolean>): Promise<void> {
        for (let drivenMs = 0; drivenMs < MAX_DRIVEN_MS; drivenMs += TIME_STEP_MS) {
            await settlePendingWork();
            if (await isDone()) {
                return;
            }
            this.clock.advance(TIME_STEP_MS);
        }

        throw new Error(`Nothing settled within ${MAX_DRIVEN_MS} ms of fake time`);
    }

    async advanceBy(ms: number): Promise<void> {
        const until = this.clock.now().getTime() + ms;
        await this.advanceUntil(() => Promise.resolve(this.clock.now().getTime() >= until));
    }

    async findRun(runId: string): Promise<RunRecord> {
        const run = await this.runs.getRun(runId);
        if (!run) {
            throw new Error(`Run ${runId} was not saved`);
        }

        return run;
    }

    async nodeRunsOf(runId: string, nodeId: string): Promise<NodeRunState[]> {
        const nodeRuns = await this.runs.listNodeRuns(runId);
        return nodeRuns.filter((nodeRun) => nodeRun.nodeId === nodeId);
    }

    async findNodeRun(
        runId: string,
        nodeId: string,
        matches: (nodeRun: NodeRunState) => boolean = () => true,
    ): Promise<NodeRunState> {
        const nodeRun = (await this.nodeRunsOf(runId, nodeId)).find(matches);
        if (!nodeRun) {
            throw new Error(`No matching NodeRun of ${nodeId} in run ${runId}`);
        }

        return nodeRun;
    }

    publishedEventsOf(type: ForjaEvent["type"]): ForjaEvent[] {
        return this.journal
            .filter((entry) => entry.kind === "published")
            .map((entry) => entry.event)
            .filter((event) => event.type === type);
    }

    private createFlowService(): FlowService {
        return createFlowService({
            repo: new FlowRepository(this.database.db),
            events: this.events,
            clock: this.clock,
            validationContext: () => Promise.resolve({}),
        });
    }

    private createSettingsService(): SettingsService {
        return createSettingsService({
            repo: new SettingsRepository(this.database.db),
            lookups: createSettingsLookups(this.database.db),
            clock: this.clock,
        });
    }

    private createExecutor(): Executor {
        const items: ItemSource = {
            getItems: (_projectId, ids) =>
                Promise.resolve(this.items.filter((item) => ids.includes(item.id))),
        };

        return createExecutor({
            runs: this.runs,
            flows: this.flows,
            projects: createProjectService({
                repo: new ProjectRepository(this.database.db),
                git: new FakeGitProvider(),
                fileExists: existsSync,
                clock: this.clock,
            }),
            settings: this.settings,
            items,
            runtime: this.runtime,
            events: this.events,
            logs: this.logs,
            usage: this.usage,
            approvals: this.approvals,
            toolProfiles: this.toolProfiles,
            credentials: this.credentials,
            redactor: this.redactor,
            fileExists: (filePath) => this.existingFiles.has(filePath),
            clock: this.clock,
            newId,
            nodeExecutors: {
                ...nodeExecutors,
                ...NOT_YET_IMPLEMENTED_EXECUTORS,
                output: createOutputExecutor({
                    runs: this.runs,
                    githubOf: () => Promise.resolve(new FakeGitHubProvider()),
                }),
            },
        });
    }
}

class JournalingRunRepository extends SqliteRunRepository {
    constructor(
        database: DatabaseHandle,
        clock: FakeClock,
        private readonly journal: JournalEntry[],
    ) {
        super(database.db, clock);
    }

    override async saveTransition(transition: RunTransition): Promise<void> {
        await super.saveTransition(transition);
        this.journal.push({
            kind: "saved",
            nodeRuns: transition.nodeRuns ?? [],
            runStatus: transition.run?.status,
        });
    }
}

function createDatabaseWithProject(): DatabaseHandle {
    const database = createTestDb();
    new ProjectRepository(database.db).insert(buildProject({ id: TEST_PROJECT_ID }));
    configureDefaultClaudeCredential(database);

    return database;
}

// An agent node fails without a Claude credential, so the project starts with one.
function configureDefaultClaudeCredential({ db }: DatabaseHandle): void {
    new CredentialRepository(db).insert({
        id: TEST_CLAUDE_CREDENTIAL_ID,
        name: "Claude",
        kind: "anthropic_api_key",
        envVar: ENV_VAR_BY_KIND.anthropic_api_key,
        sealedValue: createTestSecretBox().seal(TEST_CLAUDE_API_KEY),
        masked: maskSecret(TEST_CLAUDE_API_KEY),
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
    });
    new SettingsRepository(db).saveProjectSettings(
        TEST_PROJECT_ID,
        { ...DEFAULT_PROJECT_SETTINGS, defaultCredentialId: TEST_CLAUDE_CREDENTIAL_ID },
        SEEDED_AT,
    );
}

export function buildIssueSnapshot(number: number): WorkItemSnapshot {
    return {
        id: `itm_issue${number}`,
        title: `Issue ${number}`,
        body: `Corpo da issue ${number}`,
        number,
        url: `https://github.com/Fucks/forja/issues/${number}`,
        labels: [],
        branch: `forja/issue-${number}`,
    };
}

// How many of the NodeRuns were RUNNING at the same time, at most.
export function peakOverlapOf(nodeRuns: NodeRunState[]): number {
    const boundaries = nodeRuns.flatMap((nodeRun) => [
        { atMs: timeMsOf(nodeRun.startedAt), change: 1 },
        { atMs: timeMsOf(nodeRun.finishedAt), change: -1 },
    ]);
    // A run that ends exactly when another starts does not overlap it.
    boundaries.sort((a, b) => a.atMs - b.atMs || a.change - b.change);

    let running = 0;
    let peak = 0;
    for (const boundary of boundaries) {
        running += boundary.change;
        peak = Math.max(peak, running);
    }

    return peak;
}

function timeMsOf(date: Date | undefined): number {
    if (!date) {
        throw new Error("NodeRun without startedAt or finishedAt");
    }

    return date.getTime();
}

// Lets every promise chain started by the executor run before the clock moves again.
function settlePendingWork(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}
