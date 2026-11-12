import { deriveColumns, stageColumnIdOfNode } from "@/engine/board_columns.js";
import { findNode } from "@/engine/graph_queries.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { FlowService } from "@/server/flows/flow_service.js";
import { RunNotFoundError } from "@/server/runs/run_repository.js";
import type { RunRecord, RunRepository } from "@/server/runs/run_repository.js";
import { findRunOrThrow } from "@/server/runs/run_service.js";
import type { UsageService } from "@/server/usage/usage_service.js";
import { findPrUrl } from "@/server/runs/pr_url_artifact.js";
import type { ItemTimeline, ItemTimelineEntry } from "@/shared/board_types.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { UsageRecord } from "@/shared/usage_types.js";

const SPECIFY_STAGE_LABEL = "Especificar";

export interface ItemTimelineDeps {
    runs: RunRepository;
    usage: Pick<UsageService, "forRun">;
    flows: Pick<FlowService, "list" | "getVersion">;
}

interface RunOfItem {
    run: RunRecord;
    flowName: string;
    graph: FlowGraph;
    costUsdByNodeRun: Map<string, number>;
}

export async function buildItemTimeline(
    itemId: string,
    deps: ItemTimelineDeps,
): Promise<ItemTimeline> {
    const nodeRuns = await deps.runs.listNodeRunsOfItem(itemId);
    const [runsById, prUrl] = await Promise.all([
        loadRunsOfItem(deps, nodeRuns),
        findLatestPrUrl(deps.runs, nodeRuns),
    ]);
    const entries = sortLatestStartedFirst(nodeRuns).map((nodeRun) =>
        toTimelineEntry(nodeRun, runOf(runsById, nodeRun)),
    );

    return {
        entries,
        totalCostUsd: sumCosts(entries),
        prUrl,
        spec: findSpecOfLatestRun(nodeRuns, runsById),
    };
}

async function loadRunsOfItem(
    deps: ItemTimelineDeps,
    nodeRuns: NodeRunState[],
): Promise<Map<string, RunOfItem>> {
    const runIds = [...new Set(nodeRuns.map((nodeRun) => nodeRun.runId))];
    const runsOfItem = await Promise.all(runIds.map((runId) => loadRunOfItem(deps, runId)));

    return new Map(runsOfItem.map((runOfItem) => [runOfItem.run.id, runOfItem]));
}

async function loadRunOfItem(deps: ItemTimelineDeps, runId: string): Promise<RunOfItem> {
    const run = await findRunOrThrow(deps.runs, runId);
    const [flows, version, usageRecords] = await Promise.all([
        deps.flows.list(run.projectId, { includeArchived: true }),
        deps.flows.getVersion(run.flowId, run.flowVersion),
        deps.usage.forRun(run.id),
    ]);
    const flowName = flows.find((flow) => flow.id === run.flowId)?.name ?? run.flowId;

    return {
        run,
        flowName,
        graph: version.graph,
        costUsdByNodeRun: sumCostByNodeRun(usageRecords),
    };
}

function sumCostByNodeRun(usageRecords: UsageRecord[]): Map<string, number> {
    const costUsdByNodeRun = new Map<string, number>();
    for (const record of usageRecords) {
        const costSoFar = costUsdByNodeRun.get(record.nodeRunId) ?? 0;
        costUsdByNodeRun.set(record.nodeRunId, costSoFar + record.costUsd);
    }

    return costUsdByNodeRun;
}

function runOf(runsById: Map<string, RunOfItem>, nodeRun: NodeRunState): RunOfItem {
    const runOfItem = runsById.get(nodeRun.runId);
    if (!runOfItem) {
        throw new RunNotFoundError(nodeRun.runId);
    }

    return runOfItem;
}

// The NodeRuns come oldest run first, so reversing them first keeps the newest run on top of ties.
function sortLatestStartedFirst(nodeRuns: NodeRunState[]): NodeRunState[] {
    return nodeRuns.toReversed().sort((a, b) => startedAtForSorting(b) - startedAtForSorting(a));
}

// A NodeRun that has not started is still to come, so it sorts as later than any started one.
function startedAtForSorting(nodeRun: NodeRunState): number {
    return nodeRun.startedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function toTimelineEntry(nodeRun: NodeRunState, runOfItem: RunOfItem): ItemTimelineEntry {
    return {
        runId: nodeRun.runId,
        flowName: runOfItem.flowName,
        nodeRunId: nodeRun.id,
        nodeLabel: findNode(runOfItem.graph, nodeRun.nodeId)?.label ?? nodeRun.nodeId,
        status: nodeRun.status,
        iteration: nodeRun.iteration,
        attempt: nodeRun.attempt,
        startedAt: nodeRun.startedAt?.toISOString(),
        finishedAt: nodeRun.finishedAt?.toISOString(),
        costUsd: runOfItem.costUsdByNodeRun.get(nodeRun.id),
        summary: summaryOf(nodeRun),
    };
}

function summaryOf(nodeRun: NodeRunState): string | undefined {
    const summary = nodeRun.outputs?.summary;
    return typeof summary === "string" ? summary : undefined;
}

function sumCosts(entries: ItemTimelineEntry[]): number {
    return entries.reduce((total, entry) => total + (entry.costUsd ?? 0), 0);
}

async function findLatestPrUrl(
    runs: RunRepository,
    nodeRunsOldestRunFirst: NodeRunState[],
): Promise<string | undefined> {
    const succeededNodeRuns = nodeRunsOldestRunFirst.filter(
        (nodeRun) => nodeRun.status === "SUCCEEDED",
    );
    const artifactLists = await Promise.all(
        succeededNodeRuns.map((nodeRun) => runs.listArtifacts(nodeRun.id)),
    );

    return findPrUrl(artifactLists.flat());
}

function findSpecOfLatestRun(
    nodeRunsOldestRunFirst: NodeRunState[],
    runsById: Map<string, RunOfItem>,
): string | undefined {
    const latestNodeRun = nodeRunsOldestRunFirst.at(-1);
    if (!latestNodeRun) {
        return undefined;
    }

    const { graph } = runOf(runsById, latestNodeRun);
    const specifyColumnId = findSpecifyColumnId(graph);
    if (specifyColumnId === undefined) {
        return undefined;
    }

    const specSummaries = nodeRunsOldestRunFirst
        .filter((nodeRun) => nodeRun.runId === latestNodeRun.runId)
        .filter((nodeRun) => stageColumnIdOfNode(graph, nodeRun.nodeId) === specifyColumnId)
        .toSorted((a, b) => startedAtForSorting(a) - startedAtForSorting(b))
        .map(summaryOf);

    return specSummaries.find((summary) => summary !== undefined);
}

function findSpecifyColumnId(graph: FlowGraph): string | undefined {
    const specifyColumn = deriveColumns(graph).find(
        (column) => column.kind === "stage" && column.label === SPECIFY_STAGE_LABEL,
    );
    return specifyColumn?.id;
}
