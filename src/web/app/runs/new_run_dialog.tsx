import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { useNavigate } from "react-router";

import type { FlowSummary } from "@/shared/flow_types.js";
import { useProjectFlows } from "@/web/app/flows/use_flow_summary.js";
import { useStartRun } from "@/web/app/runs/use_runs.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { Select } from "@/web/components/ui/select.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { runPath } from "@/web/config/navigation.js";

const ITEM_ID_SEPARATORS = /[\s,]+/;

export function NewRunDialog({
    projectId,
    open,
    onClose,
}: {
    projectId: string;
    open: boolean;
    onClose: () => void;
}): JSX.Element {
    return (
        <Dialog open={open} onOpenChange={onClose} title="Nova run">
            <PublishedFlowsLoader projectId={projectId}>
                {(flows) => <NewRunForm projectId={projectId} flows={flows} onCancel={onClose} />}
            </PublishedFlowsLoader>
        </Dialog>
    );
}

// The form starts on the default flow, so it waits for the flows instead of changing its choice later.
function PublishedFlowsLoader({
    projectId,
    children,
}: {
    projectId: string;
    children: (flows: FlowSummary[]) => JSX.Element;
}): JSX.Element {
    const flowsQuery = useProjectFlows(projectId);

    if (flowsQuery.isPending) {
        return <Skeleton className="h-32" />;
    }
    if (flowsQuery.isError) {
        return <p role="alert">{flowsQuery.error.message}</p>;
    }

    const publishedFlows = flowsQuery.data.filter(isPublished);
    if (publishedFlows.length === 0) {
        return <p className="text-muted">Publique um fluxo para poder executá-lo.</p>;
    }

    return children(publishedFlows);
}

function NewRunForm({
    projectId,
    flows,
    onCancel,
}: {
    projectId: string;
    flows: FlowSummary[];
    onCancel: () => void;
}): JSX.Element {
    const [flowId, setFlowId] = useState(() => findInitialFlowId(flows));
    const [typedItemIds, setTypedItemIds] = useState("");
    const startRun = useStartRun(projectId);
    const navigate = useNavigate();

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        startRun.mutate(
            { flowId, itemIds: parseItemIds(typedItemIds) },
            { onSuccess: (run) => void navigate(runPath(projectId, run.id)) },
        );
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Fluxo" htmlFor="new-run-flow">
                <Select
                    value={flowId}
                    onChange={setFlowId}
                    options={flows.map((flow) => ({ value: flow.id, label: flow.name }))}
                />
            </Field>
            <Field
                label="Itens"
                htmlFor="new-run-items"
                hint="Opcional. Ids dos itens separados por vírgula ou espaço."
            >
                <Input
                    mono
                    value={typedItemIds}
                    onChange={(event) => setTypedItemIds(event.target.value)}
                />
            </Field>
            {startRun.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {startRun.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onCancel}>Cancelar</Button>
                <Button type="submit" variant="primary" loading={startRun.isPending}>
                    Executar
                </Button>
            </footer>
        </form>
    );
}

function isPublished(flow: FlowSummary): boolean {
    return !flow.archived && flow.latestVersion !== undefined;
}

function findInitialFlowId(flows: FlowSummary[]): string {
    const initialFlow = flows.find((flow) => flow.isDefault) ?? flows[0];

    return initialFlow?.id ?? "";
}

function parseItemIds(typedItemIds: string): string[] {
    return typedItemIds.split(ITEM_ID_SEPARATORS).filter((itemId) => itemId !== "");
}
