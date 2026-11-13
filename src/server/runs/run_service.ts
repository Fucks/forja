import { NodeRunRegistry } from "@/engine/node_run_registry.js";
import { NODE_RUN_TERMINAL, type NodeRunState } from "@/engine/node_run_state.js";
import { canRetryOnRequest } from "@/engine/retry_policy.js";
import { canTransitionRun, RUN_TERMINAL } from "@/engine/run_state.js";
import { ConflictError, NotFoundError } from "@/server/errors.js";
import type { FlowService } from "@/server/flows/flow_service.js";
import type { ArtifactRecord, RunRecord, RunRepository } from "@/server/runs/run_repository.js";
import { toRunListItem } from "@/server/runs/run_list_item.js";
import { buildRunView, type RunView } from "@/server/runs/run_view.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { Executor } from "@/server/runtime/executor.js";
import type { AuditLog } from "@/server/security/audit_log.js";
import type { TriggerRepository } from "@/server/triggers/trigger_repository.js";
import type { UsageService } from "@/server/usage/usage_service.js";
import type {
    ListRunsRequest,
    RaiseRunBudgetRequest,
    RunListItem,
    StartRunRequest,
} from "@/shared/run_types.js";

const CANNOT_PAUSE_MESSAGE = "Só uma run em execução pode ser pausada.";
const CANNOT_RESUME_MESSAGE = "Só uma run pausada pelo usuário pode ser retomada.";
const RUN_FINISHED_MESSAGE = "A run já terminou.";
const NODE_RUN_FINISHED_MESSAGE = "A execução do nó já terminou.";
const CANNOT_RETRY_MESSAGE = "Esta execução do nó não pode ser repetida agora.";
const ALREADY_RETRIED_MESSAGE = "Esta tentativa já foi repetida; repita a mais recente.";

export interface NodeRunDetail {
    nodeRun: NodeRunState;
    artifacts: ArtifactRecord[];
}

export interface RunService {
    /** @throws DomainValidationError when the flow has no published version */
    startRun(projectId: string, request: StartRunRequest): Promise<RunRecord>;
    listRuns(projectId: string, request: ListRunsRequest): Promise<RunListItem[]>;
    getRunView(runId: string): Promise<RunView>;
    /** The run actions throw ConflictError when the run's status does not allow them. */
    pauseRun(runId: string): Promise<void>;
    resumeRun(runId: string): Promise<void>;
    cancelRun(runId: string): Promise<void>;
    raiseRunBudget(runId: string, request: RaiseRunBudgetRequest): Promise<void>;
    getNodeRun(nodeRunId: string): Promise<NodeRunDetail>;
    cancelNodeRun(nodeRunId: string): Promise<void>;
    /** Reopens the run when it had finished. */
    retryNodeRun(nodeRunId: string): Promise<void>;
}

export interface RunServiceDeps {
    executor: Executor;
    runs: RunRepository;
    flows: FlowService;
    events: EventBus;
    usage: Pick<UsageService, "forRun">;
    triggers: Pick<TriggerRepository, "listByProject">;
    audit: AuditLog;
}

export function createRunService(deps: RunServiceDeps): RunService {
    const { executor, runs } = deps;

    return {
        startRun: (projectId, request) => executor.startRun({ projectId, ...request }),
        listRuns: (projectId, request) => listRuns(deps, projectId, request),
        getRunView: (runId) => getRunView(deps, runId),
        pauseRun: (runId) => pauseRun(deps, runId),
        resumeRun: (runId) => resumeRun(deps, runId),
        cancelRun: (runId) => cancelRun(deps, runId),
        raiseRunBudget: (runId, request) => raiseRunBudget(deps, runId, request),
        getNodeRun: (nodeRunId) => getNodeRun(runs, nodeRunId),
        cancelNodeRun: (nodeRunId) => cancelNodeRun(deps, nodeRunId),
        retryNodeRun: (nodeRunId) => retryNodeRun(deps, nodeRunId),
    };
}

async function listRuns(
    deps: RunServiceDeps,
    projectId: string,
    request: ListRunsRequest,
): Promise<RunListItem[]> {
    const [runs, flowNames] = await Promise.all([
        deps.runs.listRuns(projectId, request),
        findFlowNames(deps.flows, projectId),
    ]);
    const triggerNames = findTriggerNames(deps.triggers, projectId);

    return Promise.all(
        runs.map(async (run) =>
            toRunListItem(run, {
                flowName: flowNames.get(run.flowId) ?? run.flowId,
                costUsd: await sumRunCostUsd(deps.usage, run.id),
                triggerName: findTriggerName(triggerNames, run),
            }),
        ),
    );
}

async function findFlowNames(flows: FlowService, projectId: string): Promise<Map<string, string>> {
    const projectFlows = await flows.list(projectId, { includeArchived: true });

    return new Map(projectFlows.map((flow) => [flow.id, flow.name]));
}

function findTriggerNames(
    triggers: RunServiceDeps["triggers"],
    projectId: string,
): Map<string, string> {
    return new Map(triggers.listByProject(projectId).map((trigger) => [trigger.id, trigger.name]));
}

function findTriggerName(triggerNames: Map<string, string>, run: RunRecord): string | undefined {
    if (run.triggerId === undefined) {
        return undefined;
    }

    return triggerNames.get(run.triggerId);
}

async function sumRunCostUsd(usage: RunServiceDeps["usage"], runId: string): Promise<number> {
    const records = await usage.forRun(runId);

    return records.reduce((totalUsd, record) => totalUsd + record.costUsd, 0);
}

async function getRunView(deps: RunServiceDeps, runId: string): Promise<RunView> {
    const run = await findRunOrThrow(deps.runs, runId);
    const [nodeRuns, version, flowName] = await Promise.all([
        deps.runs.listNodeRuns(runId),
        deps.flows.getVersion(run.flowId, run.flowVersion),
        findFlowName(deps.flows, run),
    ]);

    return buildRunView(run, nodeRuns, version.graph, flowName, deps.events.lastEventId());
}

async function findFlowName(flows: FlowService, run: RunRecord): Promise<string> {
    const flowName = (await findFlowNames(flows, run.projectId)).get(run.flowId);
    if (flowName === undefined) {
        throw new NotFoundError(`O fluxo ${run.flowId} não existe.`);
    }

    return flowName;
}

// Pausing a run paused by the usage limit or the budget hands it over to the user.
async function pauseRun(deps: RunServiceDeps, runId: string): Promise<void> {
    const run = await findRunOrThrow(deps.runs, runId);
    const canPause = run.status === "PAUSED" || canTransitionRun(run.status, "PAUSED");
    if (!canPause) {
        throw new ConflictError(CANNOT_PAUSE_MESSAGE);
    }

    await deps.executor.pauseRun(runId);
}

// The usage limit and the budget pauses end on their own or by raising the budget.
async function resumeRun(deps: RunServiceDeps, runId: string): Promise<void> {
    const run = await findRunOrThrow(deps.runs, runId);
    const isPausedByUser = run.status === "PAUSED" && run.pauseReason === "user";
    if (!isPausedByUser) {
        throw new ConflictError(CANNOT_RESUME_MESSAGE);
    }

    await deps.executor.resumeRun(runId);
}

async function cancelRun(deps: RunServiceDeps, runId: string): Promise<void> {
    await findUnfinishedRunOrThrow(deps.runs, runId);
    await deps.executor.cancelRun(runId);
    await deps.audit.record("run.canceled", { kind: "run", id: runId });
}

async function raiseRunBudget(
    deps: RunServiceDeps,
    runId: string,
    request: RaiseRunBudgetRequest,
): Promise<void> {
    await findUnfinishedRunOrThrow(deps.runs, runId);
    await deps.executor.raiseRunBudget(runId, request.run);
}

async function getNodeRun(runs: RunRepository, nodeRunId: string): Promise<NodeRunDetail> {
    const [nodeRun, artifacts] = await Promise.all([
        findNodeRunOrThrow(runs, nodeRunId),
        runs.listArtifacts(nodeRunId),
    ]);

    return { nodeRun, artifacts };
}

async function cancelNodeRun(deps: RunServiceDeps, nodeRunId: string): Promise<void> {
    const nodeRun = await findNodeRunOrThrow(deps.runs, nodeRunId);
    await findUnfinishedRunOrThrow(deps.runs, nodeRun.runId);
    if (NODE_RUN_TERMINAL.has(nodeRun.status)) {
        throw new ConflictError(NODE_RUN_FINISHED_MESSAGE);
    }

    await deps.executor.cancelNodeRun(nodeRunId);
}

async function retryNodeRun(deps: RunServiceDeps, nodeRunId: string): Promise<void> {
    const nodeRun = await findNodeRunOrThrow(deps.runs, nodeRunId);
    const run = await findRunOrThrow(deps.runs, nodeRun.runId);
    // Whether the run is stopping lives only in the scheduler, which checks it again on delivery.
    if (!canRetryOnRequest(nodeRun.status, { status: run.status, isStopping: false })) {
        throw new ConflictError(CANNOT_RETRY_MESSAGE);
    }
    if (!(await isLatestAttempt(deps.runs, nodeRun))) {
        throw new ConflictError(ALREADY_RETRIED_MESSAGE);
    }

    await deps.executor.retryNodeRun(nodeRunId);
}

async function isLatestAttempt(runs: RunRepository, nodeRun: NodeRunState): Promise<boolean> {
    const registry = new NodeRunRegistry(await runs.listNodeRuns(nodeRun.runId));
    const latest = registry.find(nodeRun.nodeId, nodeRun.workItemId);

    return latest?.id === nodeRun.id;
}

async function findUnfinishedRunOrThrow(runs: RunRepository, runId: string): Promise<RunRecord> {
    const run = await findRunOrThrow(runs, runId);
    if (RUN_TERMINAL.has(run.status)) {
        throw new ConflictError(RUN_FINISHED_MESSAGE);
    }

    return run;
}

export async function findRunOrThrow(runs: RunRepository, runId: string): Promise<RunRecord> {
    const run = await runs.getRun(runId);
    if (!run) {
        throw new NotFoundError(`A run ${runId} não existe.`);
    }

    return run;
}

export async function findNodeRunOrThrow(
    runs: RunRepository,
    nodeRunId: string,
): Promise<NodeRunState> {
    const nodeRun = await runs.getNodeRun(nodeRunId);
    if (!nodeRun) {
        throw new NotFoundError(`A execução de nó ${nodeRunId} não existe.`);
    }

    return nodeRun;
}
