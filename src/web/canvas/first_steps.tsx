import { ArrowLeft } from "lucide-react";
import type { JSX } from "react";

import type { FlowGraph } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { EmptyCanvas } from "@/web/canvas/empty_canvas.js";

const ARROW_SIZE_PX = 16;

/** Guides the first steps of a flow: how to start it, then where its next steps come from. */
export function FirstSteps({
    graph,
    store,
}: {
    graph: FlowGraph;
    store: EditorStore;
}): JSX.Element | null {
    if (isEmptyGraph(graph)) {
        return <EmptyCanvas store={store} />;
    }
    if (hasOnlyTrigger(graph)) {
        return <PaletteHint />;
    }

    return null;
}

function PaletteHint(): JSX.Element {
    return (
        <p
            role="status"
            className="pointer-events-none absolute top-1/2 left-3 z-10 flex -translate-y-1/2 items-center gap-2 rounded-md border border-accent bg-surface px-3 py-2 text-sm shadow-lg"
        >
            <ArrowLeft aria-hidden size={ARROW_SIZE_PX} className="animate-pulse text-accent" />
            Arraste o próximo passo da paleta para o canvas e ligue-o ao Gatilho.
        </p>
    );
}

function isEmptyGraph(graph: FlowGraph): boolean {
    return graph.nodes.length === 0 && graph.groups.length === 0;
}

function hasOnlyTrigger(graph: FlowGraph): boolean {
    const [onlyNode, ...otherNodes] = graph.nodes;

    return onlyNode?.type === "trigger" && otherNodes.length === 0 && graph.groups.length === 0;
}
