import { Plus, Workflow } from "lucide-react";
import { useState } from "react";
import type { JSX, ReactNode } from "react";
import { useNavigate, useParams } from "react-router";

import type { FlowSummary } from "@/shared/flow_types.js";
import { FlowsTable } from "@/web/app/flows/flows_table.js";
import { ImportFlowButton } from "@/web/app/flows/import_flow_button.js";
import { NewFlowDialog } from "@/web/app/flows/new_flow_dialog.js";
import { RenameFlowDialog } from "@/web/app/flows/rename_flow_dialog.js";
import { useFlows } from "@/web/app/flows/use_flows.js";
import { PageTitle } from "@/web/app/page_title.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { Switch } from "@/web/components/ui/switch.js";
import { flowEditorPath } from "@/web/config/navigation.js";

export function FlowsPage(): JSX.Element {
    const { projectId = "" } = useParams();
    const [isNewFlowDialogOpen, setIsNewFlowDialogOpen] = useState(false);
    const navigate = useNavigate();

    const openFlow = (flow: FlowSummary): void => {
        setIsNewFlowDialogOpen(false);
        void navigate(flowEditorPath(flow.projectId, flow.id));
    };

    return (
        <div className="flex flex-col gap-4">
            <PageTitle>Fluxos</PageTitle>
            <FlowsContent
                projectId={projectId}
                onNewFlow={() => setIsNewFlowDialogOpen(true)}
                onImported={openFlow}
            />
            <NewFlowDialog
                projectId={projectId}
                open={isNewFlowDialogOpen}
                onOpenChange={setIsNewFlowDialogOpen}
                onCreated={openFlow}
            />
        </div>
    );
}

function FlowsContent({
    projectId,
    onNewFlow,
    onImported,
}: {
    projectId: string;
    onNewFlow: () => void;
    onImported: (flow: FlowSummary) => void;
}): JSX.Element {
    const flowsQuery = useFlows(projectId);
    const creationActions = (
        <div className="flex items-start gap-2">
            <ImportFlowButton projectId={projectId} onImported={onImported} />
            <NewFlowButton onClick={onNewFlow} />
        </div>
    );

    if (flowsQuery.isPending) {
        return <Skeleton className="h-24" />;
    }
    if (flowsQuery.isError) {
        return <p role="alert">Não foi possível carregar os fluxos.</p>;
    }
    if (flowsQuery.data.length === 0) {
        return (
            <EmptyState
                icon={Workflow}
                title="Nenhum fluxo ainda"
                description="Crie um fluxo a partir de um template, em branco, ou importe um .forja.yaml."
                action={creationActions}
            />
        );
    }

    return <FlowsList flows={flowsQuery.data} creationActions={creationActions} />;
}

function FlowsList({
    flows,
    creationActions,
}: {
    flows: FlowSummary[];
    creationActions: ReactNode;
}): JSX.Element {
    const [shouldShowArchived, setShouldShowArchived] = useState(false);
    const [flowBeingRenamed, setFlowBeingRenamed] = useState<FlowSummary | undefined>();

    return (
        <>
            <div className="flex items-start justify-between gap-2">
                <Switch
                    label="Mostrar arquivados"
                    checked={shouldShowArchived}
                    onChange={setShouldShowArchived}
                />
                {creationActions}
            </div>
            <FlowsTable
                flows={listVisibleFlows(flows, shouldShowArchived)}
                onRename={setFlowBeingRenamed}
            />
            <RenameFlowDialog
                flow={flowBeingRenamed}
                onClose={() => setFlowBeingRenamed(undefined)}
            />
        </>
    );
}

function NewFlowButton({ onClick }: { onClick: () => void }): JSX.Element {
    return (
        <Button variant="primary" onClick={onClick}>
            <Plus aria-hidden className="size-4" />
            Novo fluxo
        </Button>
    );
}

function listVisibleFlows(flows: FlowSummary[], shouldShowArchived: boolean): FlowSummary[] {
    if (shouldShowArchived) {
        return flows;
    }

    return flows.filter((flow) => !flow.archived);
}
