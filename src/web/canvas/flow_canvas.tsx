import "@xyflow/react/dist/style.css";
import "@/web/canvas/base/canvas_theme.css";

import { Controls, MiniMap, Panel, ReactFlow } from "@xyflow/react";
import type { EdgeTypes } from "@xyflow/react";
import { useMemo, useState } from "react";
import type { JSX } from "react";

import { CanvasBackground } from "@/web/canvas/base/canvas_background.js";
import { FlowEdge } from "@/web/canvas/base/flow_edge.js";
import { ConnectionGraphContext } from "@/web/canvas/connection_hints.js";
import { ConnectionRejectionTooltip } from "@/web/canvas/connection_rejection_tooltip.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { EditorToolbar } from "@/web/canvas/editor_toolbar.js";
import { FLOW_EDGE_TYPE } from "@/web/canvas/graph_mapping.js";
import { GroupContextMenu } from "@/web/canvas/group_context_menu.js";
import { nodeTypes } from "@/web/canvas/nodes/node_components.js";
import { DropTargetGroupContext } from "@/web/canvas/palette/drop_target_context.js";
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

export function FlowCanvas({
    store,
    issuesByTarget,
}: {
    store: EditorStore;
    issuesByTarget: IssuesByTarget;
}): JSX.Element {
    const graph = store((state) => state.graph);
    const { nodes, edges, onNodesChange, onEdgesChange } = useCanvasElements(store);
    const { isValidConnection, onConnect, onConnectEnd, rejection } = useCanvasConnections(store);
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

    return (
        <ConnectionGraphContext value={graph}>
            <ValidationOverlay issuesByTarget={issuesByTarget}>
                <DropTargetGroupContext value={dropTargetGroupId}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edgesWithIssues}
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
                    <ConnectionRejectionTooltip rejection={rejection} />
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
        </ConnectionGraphContext>
    );
}
