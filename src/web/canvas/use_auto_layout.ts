import { useReactFlow } from "@xyflow/react";
import { useState } from "react";

import { autoLayout } from "@/web/canvas/auto_layout.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { useToast } from "@/web/components/ui/toast.js";

export const AUTO_LAYOUT_FAILED_NOTICE = {
    title: "Não foi possível organizar o fluxo",
    description: "Tente novamente.",
    tone: "error",
} as const;

export interface AutoLayout {
    isArranging: boolean;
    arrangeGraph: () => Promise<void>;
}

// The layout goes through applyGraph, so Ctrl+Z puts every element back where it was.
export function useAutoLayout(store: EditorStore): AutoLayout {
    const { fitView } = useReactFlow();
    const toast = useToast();
    const [isArranging, setIsArranging] = useState(false);

    async function arrangeGraph(): Promise<void> {
        const graphToArrange = store.getState().graph;
        setIsArranging(true);
        try {
            const arrangedGraph = await autoLayout(graphToArrange);
            // An edit made while elk was working wins over the layout of the older graph.
            store
                .getState()
                .applyGraph((current) => (current === graphToArrange ? arrangedGraph : current));
            await fitView();
        } catch {
            toast.show(AUTO_LAYOUT_FAILED_NOTICE);
        } finally {
            setIsArranging(false);
        }
    }

    return { isArranging, arrangeGraph };
}
