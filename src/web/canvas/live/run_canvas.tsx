import { ReactFlowProvider } from "@xyflow/react";
import { useLayoutEffect, useMemo, useState } from "react";
import type { JSX } from "react";

import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import type { SerializedRunView } from "@/shared/run_types.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FlowCanvas } from "@/web/canvas/flow_canvas.js";
import { NodeRunDrawer } from "@/web/canvas/live/node_run_drawer.js";
import { aggregateNodeStates, flowingEdges } from "@/web/canvas/live/run_view_model.js";
import { NodeLiveContext, NodeLiveStore } from "@/web/canvas/nodes/node_live_context.js";
import type { NodeLiveState } from "@/web/canvas/nodes/node_live_context.js";

// The editor store holds drafts; the run's graph is a published version and is never saved.
const NEVER_SAVED = { revision: 0, updatedAt: "" };

interface DrawerTarget {
    nodeId: string;
    nodeRunId?: string;
}

export function RunCanvas({
    view,
    filterItemId,
    openNodeRunId,
}: {
    view: SerializedRunView;
    filterItemId?: string;
    openNodeRunId?: string;
}): JSX.Element {
    const store = useRunGraphStore(view);
    const liveStates = useMemo(() => aggregateNodeStates(view, filterItemId), [view, filterItemId]);
    const liveStore = usePublishedLiveStore(liveStates);
    const flowingEdgeIds = useMemo(() => flowingEdges(view), [view]);
    const [drawerTarget, setDrawerTarget] = useState(() => drawerTargetOf(view, openNodeRunId));
    const openNode = findFlowNode(view.graph, drawerTarget?.nodeId);

    return (
        <NodeLiveContext.Provider value={liveStore}>
            <ReactFlowProvider>
                <FlowCanvas
                    readOnly
                    store={store}
                    flowingEdgeIds={flowingEdgeIds}
                    onNodeClick={(nodeId) => setDrawerTarget({ nodeId })}
                />
            </ReactFlowProvider>
            {openNode && (
                <NodeRunDrawer
                    view={view}
                    node={openNode}
                    initialNodeRunId={drawerTarget?.nodeRunId}
                    onClose={() => setDrawerTarget(undefined)}
                />
            )}
        </NodeLiveContext.Provider>
    );
}

function drawerTargetOf(
    view: SerializedRunView,
    nodeRunId: string | undefined,
): DrawerTarget | undefined {
    const nodeRun = view.nodeRuns.find((candidate) => candidate.id === nodeRunId);
    if (!nodeRun) {
        return undefined;
    }

    return { nodeId: nodeRun.nodeId, nodeRunId: nodeRun.id };
}

// Groups are drawn as nodes too, but only the flow's nodes run, so a clicked group opens nothing.
function findFlowNode(graph: FlowGraph, nodeId: string | undefined): FlowNode | undefined {
    return graph.nodes.find((node) => node.id === nodeId);
}

// The store outlives each view, so only the nodes whose state changed hear about the new one.
function usePublishedLiveStore(liveStates: ReadonlyMap<string, NodeLiveState>): NodeLiveStore {
    const [store] = useState(() => new NodeLiveStore(liveStates));
    useLayoutEffect(() => store.publish(liveStates), [store, liveStates]);

    return store;
}

// The run's version never changes, so the graph is loaded once; the live state comes by context.
function useRunGraphStore(view: SerializedRunView): EditorStore {
    const [store] = useState(() => createStoreShowing(view.run.flowId, view.graph));
    return store;
}

function createStoreShowing(flowId: string, graph: FlowGraph): EditorStore {
    const store = createEditorStore();
    store.getState().load({ flowId, graph, ...NEVER_SAVED });

    return store;
}
