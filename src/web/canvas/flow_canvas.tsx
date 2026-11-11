import "@xyflow/react/dist/style.css";
import "@/web/canvas/base/canvas_theme.css";

import { Controls, MiniMap, Panel, ReactFlow } from "@xyflow/react";
import type { EdgeTypes } from "@xyflow/react";
import type { JSX } from "react";

import { CanvasBackground } from "@/web/canvas/base/canvas_background.js";
import { FlowEdge } from "@/web/canvas/base/flow_edge.js";
import { ConnectionGraphContext } from "@/web/canvas/connection_hints.js";
import { ConnectionRejectionTooltip } from "@/web/canvas/connection_rejection_tooltip.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FLOW_EDGE_TYPE } from "@/web/canvas/graph_mapping.js";
import { GroupContextMenu } from "@/web/canvas/group_context_menu.js";
import { nodeTypes } from "@/web/canvas/nodes/node_components.js";
import { DropTargetGroupContext } from "@/web/canvas/palette/drop_target_context.js";
import { useNodeDrop } from "@/web/canvas/palette/use_node_drop.js";
import { SelectionToolbar } from "@/web/canvas/selection_toolbar.js";
import { useCanvasConnections } from "@/web/canvas/use_canvas_connections.js";
import { useCanvasDeletion } from "@/web/canvas/use_canvas_deletion.js";
import { useCanvasElements } from "@/web/canvas/use_canvas_elements.js";
import { useGroupContextMenu } from "@/web/canvas/use_group_context_menu.js";
import { useGroupingShortcuts } from "@/web/canvas/use_grouping_shortcuts.js";
import { useNodeReparenting } from "@/web/canvas/use_node_reparenting.js";
import { useSelectionGrouping } from "@/web/canvas/use_selection_grouping.js";

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
    const { hasSelectedNodes, verdict, groupSelection } = useSelectionGrouping(store);
    useGroupingShortcuts(groupSelection);
    const groupMenu = useGroupContextMenu(store);
    const { onNodeDragStop } = useNodeReparenting(store);

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
                    onNodeContextMenu={groupMenu.onNodeContextMenu}
                    onNodeDragStop={onNodeDragStop}
                    minZoom={MIN_ZOOM}
                    maxZoom={MAX_ZOOM}
                    deleteKeyCode={DELETE_KEYS}
                    fitView
                >
                    <CanvasBackground />
                    <MiniMap />
                    <Controls showInteractive={false} />
                    {hasSelectedNodes && (
                        <Panel position="top-center">
                            <SelectionToolbar verdict={verdict} onGroup={groupSelection} />
                        </Panel>
                    )}
                </ReactFlow>
                <ConnectionRejectionTooltip rejection={rejection} />
                {groupMenu.openMenu && (
                    <GroupContextMenu
                        screenPosition={groupMenu.openMenu.screenPosition}
                        onUngroup={groupMenu.ungroupMenuGroup}
                        onFitToContent={groupMenu.fitMenuGroup}
                        onClose={groupMenu.closeMenu}
                    />
                )}
            </DropTargetGroupContext>
        </ConnectionGraphContext>
    );
}
