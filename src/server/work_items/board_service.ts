import { z } from "zod";

import { deriveColumns, placeItem } from "@/engine/board_columns.js";
import type { BoardColumnDef, ItemOutcome } from "@/engine/board_columns.js";
import { findNode } from "@/engine/graph_queries.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { Clock } from "@/lib/clock.js";
import type { FlowService } from "@/server/flows/flow_service.js";
import type { ArtifactRecord, RunRepository } from "@/server/runs/run_repository.js";
import { ITEM_OUTCOME_ARTIFACT } from "@/server/runtime/executors/output_executor.js";
import type { UsageService } from "@/server/usage/usage_service.js";
import type { WorkItemService } from "@/server/work_items/work_item_service.js";
import type { BoardCard, BoardView } from "@/shared/board_types.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { ITEM_DESTINATIONS } from "@/shared/node_configs/output_config.js";
import type { WorkItem } from "@/shared/work_item_types.js";

const CLOSED_ITEMS_VISIBLE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const START_OF_USAGE_HISTORY = new Date(0);

const EMPTY_FLOW_GRAPH: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };

const itemOutcomeSchema = z.object({ moveItemTo: z.enum(ITEM_DESTINATIONS).optional() });
const prUrlSchema = z.string();

export interface BoardService {
    getBoard(projectId: string): Promise<BoardView>;
}

export interface BoardServiceDeps {
    workItems: Pick<WorkItemService, "list" | "isBlocked">;
    flows: Pick<FlowService, "list" | "getVersion">;
    runs: Pick<RunRepository, "latestNodeRunsByItem" | "listArtifacts">;
    usage: Pick<UsageService, "aggregate">;
    clock: Clock;
}

interface PublishedFlow {
    flowId: string;
    graph: FlowGraph;
}

interface BoardContext {
    graph: FlowGraph;
    columns: BoardColumnDef[];
    itemsById: Map<string, WorkItem>;
    nodeRunsByItem: Record<string, NodeRunState[]>;
    costByItem: Map<string, number>;
}

interface LatestRunResults {
    outcome?: ItemOutcome;
    prUrl?: string;
}

export function createBoardService(deps: BoardServiceDeps): BoardService {
    return { getBoard: (projectId) => buildBoard(deps, projectId) };
}

async function buildBoard(deps: BoardServiceDeps, projectId: string): Promise<BoardView> {
    const items = await deps.workItems.list(projectId);
    const visibleItems = items.filter((item) => isVisibleOnBoard(item, deps.clock.now()));
    const [defaultFlow, nodeRunsByItem, costByItem] = await Promise.all([
        findPublishedDefaultFlow(deps.flows, projectId),
        deps.runs.latestNodeRunsByItem(
            projectId,
            visibleItems.map((item) => item.id),
        ),
        findCostByItem(deps, projectId),
    ]);

    const graph = defaultFlow?.graph ?? EMPTY_FLOW_GRAPH;
    const context: BoardContext = {
        graph,
        columns: deriveColumns(graph),
        itemsById: new Map(items.map((item) => [item.id, item])),
        nodeRunsByItem,
        costByItem,
    };
    const cards = await Promise.all(visibleItems.map((item) => buildCard(deps, context, item)));

    return { flowId: defaultFlow?.flowId, columns: context.columns, cards };
}

function isVisibleOnBoard(item: WorkItem, now: Date): boolean {
    if (item.state === "open") {
        return true;
    }

    const closedForMs = now.getTime() - new Date(item.updatedAt).getTime();
    return closedForMs <= CLOSED_ITEMS_VISIBLE_DAYS * MS_PER_DAY;
}

async function findPublishedDefaultFlow(
    flows: BoardServiceDeps["flows"],
    projectId: string,
): Promise<PublishedFlow | undefined> {
    const defaultFlow = (await flows.list(projectId)).find((flow) => flow.isDefault);
    if (defaultFlow?.latestVersion === undefined) {
        return undefined;
    }

    const version = await flows.getVersion(defaultFlow.id, defaultFlow.latestVersion);
    return { flowId: defaultFlow.id, graph: version.graph };
}

async function findCostByItem(
    deps: BoardServiceDeps,
    projectId: string,
): Promise<Map<string, number>> {
    const costs = await deps.usage.aggregate({
        projectId,
        from: START_OF_USAGE_HISTORY,
        to: deps.clock.now(),
        groupBy: "item",
    });

    return new Map(costs.map((cost) => [cost.key, cost.costUsd]));
}

async function buildCard(
    deps: BoardServiceDeps,
    context: BoardContext,
    item: WorkItem,
): Promise<BoardCard> {
    const latestNodeRuns = context.nodeRunsByItem[item.id] ?? [];
    const results = await findLatestRunResults(deps.runs, latestNodeRuns);
    const placement = placeItem(item, {
        columns: context.columns,
        graph: context.graph,
        latestNodeRuns,
        isBlocked: deps.workItems.isBlocked(item, context.itemsById),
        outcome: results.outcome,
    });

    return {
        item,
        columnId: placement.columnId,
        status: placement.status,
        currentNodeLabel: labelOfNode(context.graph, placement.currentNodeId),
        costUsd: context.costByItem.get(item.id),
        prUrl: results.prUrl,
        runId: latestNodeRuns.at(0)?.runId,
    };
}

async function findLatestRunResults(
    runs: BoardServiceDeps["runs"],
    latestNodeRuns: NodeRunState[],
): Promise<LatestRunResults> {
    const succeededNodeRuns = latestNodeRuns.filter((nodeRun) => nodeRun.status === "SUCCEEDED");
    const artifactLists = await Promise.all(
        succeededNodeRuns.map((nodeRun) => runs.listArtifacts(nodeRun.id)),
    );
    const artifacts = artifactLists.flat();

    return { outcome: findItemOutcome(artifacts), prUrl: findPrUrl(artifacts) };
}

function findItemOutcome(artifacts: ArtifactRecord[]): ItemOutcome | undefined {
    const outcomeArtifact = artifacts.findLast(
        (artifact) => artifact.name === ITEM_OUTCOME_ARTIFACT,
    );

    return outcomeArtifact && itemOutcomeSchema.parse(outcomeArtifact.value).moveItemTo;
}

function findPrUrl(artifacts: ArtifactRecord[]): string | undefined {
    const prUrlArtifact = artifacts.findLast((artifact) => artifact.kind === "pr_url");

    return prUrlArtifact && prUrlSchema.parse(prUrlArtifact.value);
}

function labelOfNode(graph: FlowGraph, nodeId: string | undefined): string | undefined {
    return nodeId === undefined ? undefined : findNode(graph, nodeId)?.label;
}
