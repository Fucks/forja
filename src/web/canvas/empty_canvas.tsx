import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { useReactFlow } from "@xyflow/react";
import type { JSX } from "react";

import type { FlowTemplateGraph, FlowTemplateSummary } from "@/shared/flow_types.js";
import type { ApiError } from "@/web/api/api_client.js";
import { fetchFlowTemplateGraph, useFlowTemplates } from "@/web/app/flows/use_flows.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { useAddNode } from "@/web/canvas/palette/use_add_node.js";
import { Button } from "@/web/components/ui/button.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

const TITLE_ID = "empty-canvas-title";

/** The starting choices of a flow without nodes: a template, or a lone Gatilho to build on. */
export function EmptyCanvas({ store }: { store: EditorStore }): JSX.Element {
    const startFromTemplate = useStartFromTemplate(store);
    const { addNodeAtViewportCenter } = useAddNode(store);

    // The overlay lets drags and drops through to the canvas; only the card takes the pointer.
    return (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
            <section
                aria-labelledby={TITLE_ID}
                className="pointer-events-auto flex w-full max-w-md flex-col gap-4 rounded-md border border-border bg-surface p-4 shadow-lg"
            >
                <h2 id={TITLE_ID} className="font-condensed text-lg font-semibold">
                    Por onde começar?
                </h2>
                <TemplateChoices
                    isLoading={startFromTemplate.isPending}
                    onChoose={(templateId) => startFromTemplate.mutate(templateId)}
                />
                {startFromTemplate.error && (
                    <p role="alert" className="text-xs text-status-failed">
                        {startFromTemplate.error.message}
                    </p>
                )}
                <div className="flex flex-col gap-1 border-t border-border pt-3">
                    <h3 className="text-sm font-medium">Começar do zero</h3>
                    <p className="text-xs text-muted">
                        Coloca um Gatilho no canvas; depois arraste os próximos passos da paleta.
                    </p>
                    <Button
                        className="self-start"
                        onClick={() => addNodeAtViewportCenter("trigger")}
                    >
                        Começar do zero
                    </Button>
                </div>
            </section>
        </div>
    );
}

function TemplateChoices({
    isLoading,
    onChoose,
}: {
    isLoading: boolean;
    onChoose: (templateId: string) => void;
}): JSX.Element {
    const templatesQuery = useFlowTemplates();

    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Começar de um template</h3>
            {templatesQuery.isPending && <Skeleton className="h-16" />}
            <ul className="flex flex-col gap-2">
                {templatesQuery.data?.map((template) => (
                    <li key={template.id}>
                        <TemplateButton
                            template={template}
                            disabled={isLoading}
                            onChoose={() => onChoose(template.id)}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function TemplateButton({
    template,
    disabled,
    onChoose,
}: {
    template: FlowTemplateSummary;
    disabled: boolean;
    onChoose: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onChoose}
            className="flex w-full flex-col gap-0.5 rounded-sm border border-border p-2 text-left hover:bg-surface-raised disabled:opacity-60"
        >
            <span className="text-sm font-medium">{template.name}</span>
            <span className="text-xs text-muted">{template.description}</span>
        </button>
    );
}

// Applied as an edit of the draft, so it is saved like any change and can be undone.
function useStartFromTemplate(
    store: EditorStore,
): UseMutationResult<FlowTemplateGraph, ApiError, string> {
    const { fitView } = useReactFlow();

    return useMutation({
        mutationFn: fetchFlowTemplateGraph,
        onSuccess: ({ graph }) => {
            store.getState().applyGraph(() => graph);
            void fitView();
        },
    });
}
