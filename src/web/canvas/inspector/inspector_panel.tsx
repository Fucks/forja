import type { JSX } from "react";

import { findGroup, findNode } from "@/engine/graph_queries.js";
import type { FlowGraph, FlowGroup, FlowNode } from "@/shared/flow_graph.js";
import { useProjectSettings } from "@/web/app/projects/use_settings.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { GroupInspector } from "@/web/canvas/inspector/group_inspector.js";
import { InheritedSettingsContext } from "@/web/canvas/inspector/inherited_settings.js";
import { inspectorRegistry } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectedTargetContext } from "@/web/canvas/inspector/use_focus_field.js";
import { updateNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { KeyValue } from "@/web/components/ui/key_value.js";

export function InspectorPanel({
    store,
    projectId,
}: {
    store: EditorStore;
    projectId: string;
}): JSX.Element {
    const graph = store((state) => state.graph);
    const selection = store((state) => state.selection);
    const projectSettings = useProjectSettings(projectId).data;
    const selectedId = findSingleSelectedId(selection);
    const overview = <FlowOverview graph={graph} selectedCount={selection.length} />;
    if (selectedId === undefined) {
        return overview;
    }

    const selectedGroup = findGroup(graph, selectedId);
    if (selectedGroup) {
        return (
            <InspectedTargetContext value={selectedGroup.id}>
                <SelectedGroupInspector store={store} group={selectedGroup} graph={graph} />
            </InspectedTargetContext>
        );
    }

    const selectedNode = findNode(graph, selectedId);
    if (!selectedNode) {
        return overview;
    }

    return (
        <InheritedSettingsContext value={projectSettings}>
            <InspectedTargetContext value={selectedNode.id}>
                <SelectedNodeInspector store={store} node={selectedNode} graph={graph} />
            </InspectedTargetContext>
        </InheritedSettingsContext>
    );
}

// Keyed by the selected element, so the fields' local edits never carry over to the next one.
function SelectedNodeInspector({
    store,
    node,
    graph,
}: {
    store: EditorStore;
    node: FlowNode;
    graph: FlowGraph;
}): JSX.Element {
    const Inspector = inspectorRegistry[node.type];
    function changeSelectedNode(update: (node: FlowNode) => FlowNode): void {
        store.getState().applyGraph((current) => updateNodeConfig(current, node.id, update));
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <Inspector key={node.id} node={node} graph={graph} onChange={changeSelectedNode} />
        </div>
    );
}

function SelectedGroupInspector({
    store,
    group,
    graph,
}: {
    store: EditorStore;
    group: FlowGroup;
    graph: FlowGraph;
}): JSX.Element {
    function changeSelectedGroup(update: (group: FlowGroup) => FlowGroup): void {
        store.getState().applyGraph((current) => updateGroup(current, group.id, update));
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <GroupInspector
                key={group.id}
                group={group}
                graph={graph}
                onChange={changeSelectedGroup}
            />
        </div>
    );
}

function findSingleSelectedId(selection: string[]): string | undefined {
    return selection.length === 1 ? selection[0] : undefined;
}

function updateGroup(
    graph: FlowGraph,
    groupId: string,
    update: (group: FlowGroup) => FlowGroup,
): FlowGraph {
    return {
        ...graph,
        groups: graph.groups.map((group) => (group.id === groupId ? update(group) : group)),
    };
}

function FlowOverview({
    graph,
    selectedCount,
}: {
    graph: FlowGraph;
    selectedCount: number;
}): JSX.Element {
    const instruction =
        selectedCount > 1
            ? `${selectedCount} itens selecionados. Selecione um só nó para editar.`
            : "Selecione um nó para editar.";

    return (
        <div className="flex flex-col gap-2 px-3 text-sm">
            <p className="text-muted">{instruction}</p>
            <KeyValue
                items={[
                    { label: "Nós", value: graph.nodes.length },
                    { label: "Conexões", value: graph.edges.length },
                    { label: "Grupos", value: graph.groups.length },
                ]}
            />
        </div>
    );
}
