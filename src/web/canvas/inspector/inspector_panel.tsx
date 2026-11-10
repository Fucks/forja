import type { JSX } from "react";

import { findNode } from "@/engine/graph_queries.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { useProjectSettings } from "@/web/app/projects/use_settings.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { InheritedSettingsContext } from "@/web/canvas/inspector/inherited_settings.js";
import { inspectorRegistry } from "@/web/canvas/inspector/inspector_registry.js";
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
    const selectedNode = findSingleSelectedNode(graph, selection);

    if (!selectedNode) {
        return <FlowOverview graph={graph} selectedCount={selection.length} />;
    }

    const Inspector = inspectorRegistry[selectedNode.type];
    const selectedNodeId = selectedNode.id;
    function changeSelectedNode(update: (node: FlowNode) => FlowNode): void {
        store.getState().applyGraph((current) => updateNodeConfig(current, selectedNodeId, update));
    }

    // Keyed by node, so the fields' local edits never carry over to the next selected node.
    return (
        <InheritedSettingsContext value={projectSettings}>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <Inspector
                    key={selectedNode.id}
                    node={selectedNode}
                    graph={graph}
                    onChange={changeSelectedNode}
                />
            </div>
        </InheritedSettingsContext>
    );
}

function findSingleSelectedNode(graph: FlowGraph, selection: string[]): FlowNode | undefined {
    const [onlySelectedId] = selection;
    if (selection.length !== 1 || onlySelectedId === undefined) {
        return undefined;
    }

    return findNode(graph, onlySelectedId);
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
