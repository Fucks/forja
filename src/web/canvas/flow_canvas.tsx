import "@xyflow/react/dist/style.css";
import "@/web/canvas/base/canvas_theme.css";

import { Controls, MiniMap, Panel, ReactFlow } from "@xyflow/react";
import type { EdgeTypes, FinalConnectionState } from "@xyflow/react";
import { useMemo, useState } from "react";
import type { JSX } from "react";

import { CanvasBackground } from "@/web/canvas/base/canvas_background.js";
import { FlowEdge } from "@/web/canvas/base/flow_edge.js";
import { ConnectionGraphContext } from "@/web/canvas/connection_hints.js";
import { ConnectionRejectionTooltip } from "@/web/canvas/connection_rejection_tooltip.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { EditorToolbar } from "@/web/canvas/editor_toolbar.js";
import { FLOW_EDGE_TYPE } from "@/web/canvas/graph_mapping.js";
import type { RFEdge } from "@/web/canvas/graph_mapping.js";
import { GroupContextMenu } from "@/web/canvas/group_context_menu.js";
import { ImplicitItemOverlay } from "@/web/canvas/implicit_item_overlay.js";
import { nodeTypes } from "@/web/canvas/nodes/node_components.js";
import { AddFromPortMenu } from "@/web/canvas/palette/add_from_port_menu.js";
import { DropTargetGroupContext } from "@/web/canvas/palette/drop_target_context.js";
import { useAddFromPort } from "@/web/canvas/palette/use_add_from_port.js";
import { useNodeDrop } from "@/web/canvas/palette/use_node_drop.js";
import { SelectionToolbar } from "@/web/canvas/selection_toolbar.js";
import { ShortcutsDialog } from "@/web/canvas/shortcuts_dialog.js";
import { useAutoLayout } from "@/web/canvas/use_auto_layout.js";
import { useCanvasClipboard } from "@/web/canvas/use_canvas_clipboard.js";
import { useCanvasConnections } from "@/web/canvas/use_canvas_connections.js";
import { useCanvasDeletion } from "@/web/canvas/use_canvas_deletion.js";
import { useCanvasElements } from "@/web/canvas/use_canvas_elements.js";
import { useEditorShortcuts } from "@/web/canvas/use_editor_shortcuts.js";
import { useGroupContextMenu } from "@/web/canvas/use_group_context_menu.js";
import { useGroupingShortcuts } from "@/web/canvas/use_grouping_shortcuts.js";
import { useNodeReparenting } from "@/web/canvas/use_node_reparenting.js";
import { useSelectionGrouping } from "@/web/canvas/use_selection_grouping.js";
import { markInvalidEdges, ValidationOverlay } from "@/web/canvas/validation_overlay.js";
import type { IssuesByTarget } from "@/web/canvas/use_validation.js";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

const DELETE_KEYS = ["Delete", "Backspace"];

const EDGE_TYPES: EdgeTypes = { [FLOW_EDGE_TYPE]: FlowEdge };

type FlowCanvasProps =
    | { readOnly?: false; store: EditorStore; issuesByTarget: IssuesByTarget }
    | ReadOnlyFlowCanvasProps;

interface ReadOnlyFlowCanvasProps {
    readOnly: true;
    store: EditorStore;
    flowingEdgeIds: ReadonlySet<string>;
    onNodeClick: (nodeId: string) => void;
}

export function FlowCanvas(props: FlowCanvasProps): JSX.Element {
    if (props.readOnly) {
        return <ReadOnlyFlowCanvas {...props} />;
    }

    return <EditableFlowCanvas store={props.store} issuesByTarget={props.issuesByTarget} />;
}

// Shows a run: the graph can be panned, zoomed and its nodes clicked, but not selected, moved,
// connected or edited.
function ReadOnlyFlowCanvas({
    store,
    flowingEdgeIds,
    onNodeClick,
}: ReadOnlyFlowCanvasProps): JSX.Element {
    const { nodes, edges, onNodesChange } = useCanvasElements(store);
    const edgesWithFlow = useMemo(
        () => markFlowingEdges(edges, flowingEdgeIds),
        [edges, flowingEdgeIds],
    );

    return (
        <ReactFlow
            nodes={nodes}
            edges={edgesWithFlow}
            nodeTypes={nodeTypes}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={(_event, node) => onNodeClick(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            fitView
        >
            <CanvasBackground />
            <MiniMap />
            <Controls showInteractive={false} />
        </ReactFlow>
    );
}

// Exported because React Flow draws an edge only between measured nodes, which jsdom never has.
export function markFlowingEdges(edges: RFEdge[], flowingEdgeIds: ReadonlySet<string>): RFEdge[] {
    return edges.map((edge) => {
        if (!flowingEdgeIds.has(edge.id)) {
            return edge;
        }

        return { ...edge, data: { ...edge.data, flowing: true } };
    });
}

function EditableFlowCanvas({
    store,
    issuesByTarget,
}: {
    store: EditorStore;
    issuesByTarget: IssuesByTarget;
}): JSX.Element {
    const graph = store((state) => state.graph);
    const { nodes, edges, onNodesChange, onEdgesChange } = useCanvasElements(store);
    const connections = useCanvasConnections(store);
    const addFromPort = useAddFromPort(store);
    const { onNodesDelete, onEdgesDelete } = useCanvasDeletion(store);
    const { dropTargetGroupId, onDragOver, onDragLeave, onDrop } = useNodeDrop(store);
    const { hasSelectedNodes, verdict, groupSelection } = useSelectionGrouping(store);
    useGroupingShortcuts(groupSelection);
    const groupMenu = useGroupContextMenu(store);
    const { onNodeDragStop } = useNodeReparenting(store);
    const { duplicateSelection } = useCanvasClipboard(store);
    const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false);
    const openShortcutsDialog = (): void => setIsShortcutsDialogOpen(true);
    useEditorShortcuts({ store, duplicateSelection, openHelp: openShortcutsDialog });
    const { isArranging, arrangeGraph } = useAutoLayout(store);
    const edgesWithIssues = useMemo(
        () => markInvalidEdges(edges, issuesByTarget),
        [edges, issuesByTarget],
    );

    // A connection let go over a port may be explained as refused; one let go on empty space
    // offers the nodes that fit the dragged port.
    function onConnectEnd(
        event: MouseEvent | TouchEvent,
        connectionState: FinalConnectionState,
    ): void {
        connections.onConnectEnd(event, connectionState);
        addFromPort.onConnectEnd(event, connectionState);
    }

    return (
        <ConnectionGraphContext value={graph}>
            <ImplicitItemOverlay graph={graph}>
                <ValidationOverlay issuesByTarget={issuesByTarget}>
                    <DropTargetGroupContext value={dropTargetGroupId}>
                        <ReactFlow
                            nodes={nodes}
                            edges={edgesWithIssues}
                            nodeTypes={nodeTypes}
                            edgeTypes={EDGE_TYPES}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            isValidConnection={connections.isValidConnection}
                            onConnect={connections.onConnect}
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
                            <Panel position="top-right">
                                <EditorToolbar
                                    store={store}
                                    isArranging={isArranging}
                                    onArrange={() => void arrangeGraph()}
                                    onShowShortcuts={openShortcutsDialog}
                                />
                            </Panel>
                            {hasSelectedNodes && (
                                <Panel position="top-center">
                                    <SelectionToolbar verdict={verdict} onGroup={groupSelection} />
                                </Panel>
                            )}
                        </ReactFlow>
                        <ConnectionRejectionTooltip rejection={connections.rejection} />
                        {addFromPort.openMenu && (
                            <AddFromPortMenu
                                screenPosition={addFromPort.openMenu.screenPosition}
                                nodeTypes={addFromPort.openMenu.compatibleNodeTypes}
                                onChoose={addFromPort.addLinkedNode}
                                onClose={addFromPort.closeMenu}
                            />
                        )}
                        {groupMenu.openMenu && (
                            <GroupContextMenu
                                screenPosition={groupMenu.openMenu.screenPosition}
                                onUngroup={groupMenu.ungroupMenuGroup}
                                onFitToContent={groupMenu.fitMenuGroup}
                                onClose={groupMenu.closeMenu}
                            />
                        )}
                        <ShortcutsDialog
                            open={isShortcutsDialogOpen}
                            onOpenChange={setIsShortcutsDialogOpen}
                        />
                    </DropTargetGroupContext>
                </ValidationOverlay>
            </ImplicitItemOverlay>
        </ConnectionGraphContext>
    );
}
