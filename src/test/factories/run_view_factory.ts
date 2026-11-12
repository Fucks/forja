import type { SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";

const RUN_CREATED_AT = "2026-01-01T12:00:00.000Z";

export function buildSerializedRunView(
    overrides: Partial<SerializedRunView> = {},
): SerializedRunView {
    return {
        run: {
            id: "run-1",
            projectId: "project-1",
            flowId: "flow-1",
            flowVersion: 4,
            flowName: "Fábrica básica",
            status: "RUNNING",
            createdAt: RUN_CREATED_AT,
            startedAt: RUN_CREATED_AT,
            itemIds: [],
            failedItemIds: [],
        },
        nodeRuns: [],
        groups: {},
        graph: buildCanonicalFlow(),
        lastEventId: 0,
        ...overrides,
    };
}

export function buildSerializedNodeRun(
    overrides: Partial<SerializedNodeRun> = {},
): SerializedNodeRun {
    return {
        id: "node-run-1",
        runId: "run-1",
        nodeId: "node-1",
        iteration: 0,
        attempt: 1,
        groupPath: [],
        status: "PENDING",
        ...overrides,
    };
}
