import "@xyflow/react/dist/style.css";
import "@/web/canvas/base/canvas_theme.css";

import { Controls, MiniMap, ReactFlow } from "@xyflow/react";
import type { EdgeTypes } from "@xyflow/react";
import type { JSX } from "react";

import { CanvasBackground } from "@/web/canvas/base/canvas_background.js";
import { FlowEdge } from "@/web/canvas/base/flow_edge.js";
import { ConnectionGraphContext } from "@/web/canvas/connection_hints.js";
import { ConnectionRejectionTooltip } from "@/web/canvas/connection_rejection_tooltip.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FLOW_EDGE_TYPE } from "@/web/canvas/graph_mapping.js";
import { nodeTypes } from "@/web/canvas/nodes/node_components.js";
import { DropTargetGroupContext } from "@/web/canvas/palette/drop_target_context.js";
import { useNodeDrop } from "@/web/canvas/palette/use_node_drop.js";
import { useCanvasConnections } from "@/web/canvas/use_canvas_connections.js";
import { useCanvasDeletion } from "@/web/canvas/use_canvas_deletion.js";
import { useCanvasElements } from "@/web/canvas/use_canvas_elements.js";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

const DELETE_KEYS = ["Delete", "Backspace"];

const EDGE_TYPES: EdgeTypes = { [FLOW_EDGE_TYPE]: FlowEdge };

export function FlowCanvas({ store }: { store: EditorStore }): JSX.Element {
    const graph = store((state) => state.graph);
    const { nodes, edges, onNodesChange, onEdgesChange } = useCanvasElements(store);
    const { isValidConnection, onConnect, onConnectEnd, rejection } = useCanvasConnections(store);
    const { onNodesDelete, onEdgesDelete } = useCanvasDeletion(store);
    const { dropTargetGroupId, onDragOver, onDragLeave, onDrop } = useNodeDrop(store);

    return (
        <ConnectionGraphContext value={graph}>
            <DropTargetGroupContext value={dropTargetGroupId}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={EDGE_TYPES}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    isValidConnection={isValidConnection}
                    onConnect={onConnect}
                    onConnectEnd={onConnectEnd}
                    onNodesDelete={onNodesDelete}
                    onEdgesDelete={onEdgesDelete}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    minZoom={MIN_ZOOM}
                    maxZoom={MAX_ZOOM}
                    deleteKeyCode={DELETE_KEYS}
                    fitView
                >
                    <CanvasBackground />
                    <MiniMap />
                    <Controls showInteractive={false} />
                </ReactFlow>
                <ConnectionRejectionTooltip rejection={rejection} />
            </DropTargetGroupContext>
        </ConnectionGraphContext>
    );
}
