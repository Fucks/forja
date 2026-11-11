import { CircleAlert, Pause, Play, Plus, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";
import { useParams } from "react-router";

import type { ListedTrigger, TriggerWithToken } from "@/shared/trigger_types.js";
import { useProjectFlows } from "@/web/app/flows/use_flow_summary.js";
import { PageTitle } from "@/web/app/page_title.js";
import { findFlowName } from "@/web/app/triggers/find_flow_name.js";
import { RemoveTriggerDialog } from "@/web/app/triggers/remove_trigger_dialog.js";
import { TriggerFormDialog } from "@/web/app/triggers/trigger_form.js";
import type { TriggerEditor } from "@/web/app/triggers/trigger_form.js";
import { TriggerHistoryDrawer } from "@/web/app/triggers/trigger_history.js";
import { TriggerRow } from "@/web/app/triggers/trigger_row.js";
import type { TriggerActions } from "@/web/app/triggers/trigger_row.js";
import {
    useSetTriggersPaused,
    useTriggers,
    useTriggersPaused,
} from "@/web/app/triggers/use_triggers.js";
import { WebhookTokenDialog } from "@/web/app/triggers/webhook_token_dialog.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

const CLOSED_EDITOR: TriggerEditor = { mode: "closed" };

interface PauseAllAction {
    label: string;
    icon: LucideIcon;
}

const PAUSE_ALL_ACTION: PauseAllAction = { label: "Pausar todos", icon: Pause };
const RESUME_ALL_ACTION: PauseAllAction = { label: "Retomar todos", icon: Play };

export function TriggersPage(): JSX.Element {
    const { projectId = "" } = useParams();
    const [editor, setEditor] = useState<TriggerEditor>(CLOSED_EDITOR);
    const [createdWebhook, setCreatedWebhook] = useState<TriggerWithToken>();
    const [historyTrigger, setHistoryTrigger] = useState<ListedTrigger>();
    const [pendingRemoval, setPendingRemoval] = useState<ListedTrigger>();

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <PageTitle>Gatilhos</PageTitle>
                <div className="flex gap-2">
                    <PauseAllButton />
                    <Button variant="primary" onClick={() => setEditor({ mode: "create" })}>
                        <Plus aria-hidden className="size-3.5" />
                        Novo gatilho
                    </Button>
                </div>
            </div>
            <TriggersContent
                projectId={projectId}
                actions={{
                    onEdit: (trigger) => setEditor({ mode: "edit", trigger }),
                    onShowHistory: setHistoryTrigger,
                    onRemove: setPendingRemoval,
                }}
            />
            <TriggerFormDialog
                projectId={projectId}
                editor={editor}
                onClose={() => setEditor(CLOSED_EDITOR)}
                onWebhookCreated={setCreatedWebhook}
            />
            {createdWebhook && (
                <WebhookTokenDialog
                    trigger={createdWebhook}
                    onClose={() => setCreatedWebhook(undefined)}
                />
            )}
            {historyTrigger && (
                <TriggerHistoryDrawer
                    trigger={historyTrigger}
                    onClose={() => setHistoryTrigger(undefined)}
                />
            )}
            {pendingRemoval && (
                <RemoveTriggerDialog
                    trigger={pendingRemoval}
                    onClose={() => setPendingRemoval(undefined)}
                />
            )}
        </div>
    );
}

function PauseAllButton(): JSX.Element | null {
    const pausedQuery = useTriggersPaused();
    const setTriggersPaused = useSetTriggersPaused();
    if (!pausedQuery.isSuccess) {
        return null;
    }

    const isPaused = pausedQuery.data.paused;
    const { label, icon: Icon } = isPaused ? RESUME_ALL_ACTION : PAUSE_ALL_ACTION;
    return (
        <Button
            loading={setTriggersPaused.isPending}
            onClick={() => setTriggersPaused.mutate(!isPaused)}
        >
            <Icon aria-hidden className="size-3.5" />
            {label}
        </Button>
    );
}

function TriggersContent({
    projectId,
    actions,
}: {
    projectId: string;
    actions: TriggerActions;
}): JSX.Element {
    const triggersQuery = useTriggers(projectId);

    if (triggersQuery.isPending) {
        return <Skeleton className="h-24" />;
    }
    if (triggersQuery.isError) {
        return (
            <EmptyState
                icon={CircleAlert}
                title="Não foi possível carregar os gatilhos"
                description={triggersQuery.error.message}
            />
        );
    }
    if (triggersQuery.data.length === 0) {
        return (
            <EmptyState
                icon={Zap}
                title="Nenhum gatilho ainda"
                description="Crie um gatilho para iniciar um fluxo por horário, evento, webhook ou coluna do board."
            />
        );
    }

    return <TriggersTable projectId={projectId} triggers={triggersQuery.data} actions={actions} />;
}

function TriggersTable({
    projectId,
    triggers,
    actions,
}: {
    projectId: string;
    triggers: ListedTrigger[];
    actions: TriggerActions;
}): JSX.Element {
    const flows = useProjectFlows(projectId).data ?? [];

    return (
        <table className="w-full border-collapse text-left">
            <thead className="border-b border-border text-muted">
                <tr>
                    <th className="py-2 pr-4 font-medium">Nome</th>
                    <th className="py-2 pr-4 font-medium">Fluxo</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Política</th>
                    <th className="py-2 pr-4 font-medium">Próximo disparo</th>
                    <th className="py-2 pr-4 font-medium">Último disparo</th>
                    <th className="py-2 pr-4 font-medium">Habilitado</th>
                    <th className="py-2 font-medium">
                        <span className="sr-only">Ações</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {triggers.map((trigger) => (
                    <TriggerRow
                        key={trigger.id}
                        trigger={trigger}
                        flowName={findFlowName(flows, trigger.flowId)}
                        actions={actions}
                    />
                ))}
            </tbody>
        </table>
    );
}
