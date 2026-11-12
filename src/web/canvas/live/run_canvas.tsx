import { ReactFlowProvider } from "@xyflow/react";
import { useMemo, useState } from "react";
import type { JSX } from "react";

import type { FlowGraph } from "@/shared/flow_graph.js";
import type { SerializedRunView } from "@/shared/run_types.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FlowCanvas } from "@/web/canvas/flow_canvas.js";
import { aggregateNodeStates, flowingEdges } from "@/web/canvas/live/run_view_model.js";
import { NodeLiveContext } from "@/web/canvas/nodes/node_live_context.js";

// The editor store holds drafts; the run's graph is a published version and is never saved.
const NEVER_SAVED = { revision: 0, updatedAt: "" };

export function RunCanvas({
    view,
    filterItemId,
}: {
    view: SerializedRunView;
    filterItemId?: string;
}): JSX.Element {
    const store = useRunGraphStore(view);
    const liveStates = useMemo(() => aggregateNodeStates(view, filterItemId), [view, filterItemId]);
    const flowingEdgeIds = useMemo(() => flowingEdges(view), [view]);

    return (
        <NodeLiveContext.Provider value={liveStates}>
            <ReactFlowProvider>
                <FlowCanvas readOnly store={store} flowingEdgeIds={flowingEdgeIds} />
            </ReactFlowProvider>
        </NodeLiveContext.Provider>
    );
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
