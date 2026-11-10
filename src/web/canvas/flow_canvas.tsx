import "@xyflow/react/dist/style.css";
import "@/web/canvas/base/canvas_theme.css";

import { Controls, MiniMap, ReactFlow } from "@xyflow/react";
import type { EdgeTypes } from "@xyflow/react";
import type { JSX } from "react";

import { CanvasBackground } from "@/web/canvas/base/canvas_background.js";
import { FlowEdge } from "@/web/canvas/base/flow_edge.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FLOW_EDGE_TYPE } from "@/web/canvas/graph_mapping.js";
import { nodeTypes } from "@/web/canvas/nodes/node_components.js";
import { useCanvasElements } from "@/web/canvas/use_canvas_elements.js";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

const EDGE_TYPES: EdgeTypes = { [FLOW_EDGE_TYPE]: FlowEdge };

export function FlowCanvas({ store }: { store: EditorStore }): JSX.Element {
    const { nodes, edges, onNodesChange, onEdgesChange } = useCanvasElements(store);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            nodesConnectable={false}
            deleteKeyCode={null}
            fitView
        >
            <CanvasBackground />
            <MiniMap />
            <Controls showInteractive={false} />
        </ReactFlow>
    );
}
