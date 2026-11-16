import { createContext, useContext, useMemo } from "react";
import type { JSX, ReactNode } from "react";

import { incomingEdges } from "@/engine/graph_queries.js";
import { planNodeScopes } from "@/engine/node_scopes.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";

export const ITEM_INPUT_PORT = "item";

const NO_NODES: ReadonlySet<string> = new Set();

const ImplicitItemContext = createContext<ReadonlySet<string>>(NO_NODES);

// Worked out once per graph: the scopes walk the whole graph, too much for every node render.
export function ImplicitItemOverlay({
    graph,
    children,
}: {
    graph: FlowGraph;
    children: ReactNode;
}): JSX.Element {
    const nodeIds = useMemo(() => listNodesWithImplicitItem(graph), [graph]);

    return <ImplicitItemContext value={nodeIds}>{children}</ImplicitItemContext>;
}

export function useHasImplicitItem(nodeId: string): boolean {
    return useContext(ImplicitItemContext).has(nodeId);
}

// A node that runs once per item receives the current item even with its item port unwired.
function listNodesWithImplicitItem(graph: FlowGraph): Set<string> {
    const scopes = planNodeScopes(graph);
    const nodesWithImplicitItem = graph.nodes.filter(
        (node) => scopes.get(node.id) === "item" && hasUnwiredItemInput(graph, node),
    );

    return new Set(nodesWithImplicitItem.map((node) => node.id));
}

function hasUnwiredItemInput(graph: FlowGraph, node: FlowNode): boolean {
    const hasItemInput = node.inputs.some((port) => port.name === ITEM_INPUT_PORT);
    const isItemInputWired = incomingEdges(graph, node.id).some(
        (edge) => edge.to.port === ITEM_INPUT_PORT,
    );

    return hasItemInput && !isItemInputWired;
}
