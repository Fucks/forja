import { useState } from "react";
import type { FormEvent, JSX } from "react";

import type { FlowSummary, FlowTemplateSummary } from "@/shared/flow_types.js";
import { useCreateFlow, useFlowTemplates } from "@/web/app/flows/use_flows.js";
import { Button } from "@/web/components/ui/button.js";
import { cn } from "@/web/components/ui/cn.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

const BLANK_FLOW_CARD = { name: "Em branco", description: "Começa com o canvas vazio." };

export function NewFlowDialog({
    projectId,
    open,
    onOpenChange,
    onCreated,
}: {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (flow: FlowSummary) => void;
}): JSX.Element {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title="Novo fluxo"
            description="Comece de um template ou do zero."
            size="lg"
        >
            <NewFlowForm
                projectId={projectId}
                onCreated={onCreated}
                onCancel={() => onOpenChange(false)}
            />
        </Dialog>
    );
}

function NewFlowForm({
    projectId,
    onCreated,
    onCancel,
}: {
    projectId: string;
    onCreated: (flow: FlowSummary) => void;
    onCancel: () => void;
}): JSX.Element {
    const [name, setName] = useState("");
    const [templateId, setTemplateId] = useState<string | undefined>(undefined);
    const createFlow = useCreateFlow(projectId);

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        createFlow.mutate({ name, templateId }, { onSuccess: onCreated });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-3">
            <TemplatePicker selectedTemplateId={templateId} onSelect={setTemplateId} />
            <Field label="Nome" htmlFor="new-flow-name">
                <Input required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            {createFlow.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {createFlow.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onCancel}>Cancelar</Button>
                <Button type="submit" variant="primary" loading={createFlow.isPending}>
                    Criar fluxo
                </Button>
            </footer>
        </form>
    );
}

/** No template id means the blank flow. */
function TemplatePicker({
    selectedTemplateId,
    onSelect,
}: {
    selectedTemplateId: string | undefined;
    onSelect: (templateId: string | undefined) => void;
}): JSX.Element {
    const templatesQuery = useFlowTemplates();

    return (
        <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-1 text-sm font-medium">Ponto de partida</legend>
            <TemplateCard
                card={BLANK_FLOW_CARD}
                isSelected={selectedTemplateId === undefined}
                onSelect={() => onSelect(undefined)}
            />
            {templatesQuery.isPending && <Skeleton className="h-20" />}
            {templatesQuery.data?.map((template) => (
                <TemplateCard
                    key={template.id}
                    card={template}
                    isSelected={selectedTemplateId === template.id}
                    onSelect={() => onSelect(template.id)}
                />
            ))}
        </fieldset>
    );
}

function TemplateCard({
    card,
    isSelected,
    onSelect,
}: {
    card: Pick<FlowTemplateSummary, "name" | "description">;
    isSelected: boolean;
    onSelect: () => void;
}): JSX.Element {
    return (
        <label
            className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-md border p-3",
                isSelected ? "border-accent bg-surface-raised" : "border-border",
            )}
        >
            <span className="flex items-center gap-2 font-medium">
                <input
                    type="radio"
                    name="flow-template"
                    checked={isSelected}
                    onChange={onSelect}
                    className="accent-accent"
                />
                {card.name}
            </span>
            <span className="text-xs text-muted">{card.description}</span>
        </label>
    );
}
