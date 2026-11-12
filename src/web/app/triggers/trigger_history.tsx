import { CircleAlert, History } from "lucide-react";
import type { JSX } from "react";
import { Link } from "react-router";

import { formatDateTime } from "@/lib/format.js";
import type { Trigger, TriggerFire } from "@/shared/trigger_types.js";
import { FIRE_OUTCOME_STYLES } from "@/web/app/triggers/trigger_labels.js";
import { useTriggerHistory } from "@/web/app/triggers/use_triggers.js";
import { Drawer } from "@/web/components/ui/drawer.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { runPath } from "@/web/config/navigation.js";

const HISTORY_PAGE_SIZE = 50;

export function TriggerHistoryDrawer({
    trigger,
    onClose,
}: {
    trigger: Trigger;
    onClose: () => void;
}): JSX.Element {
    return (
        <Drawer open onOpenChange={onClose} side="right" title={`Histórico de ${trigger.name}`}>
            <TriggerHistoryContent trigger={trigger} />
        </Drawer>
    );
}

export function FireOutcome({
    fire,
    prefix = "",
}: {
    fire: TriggerFire;
    prefix?: string;
}): JSX.Element {
    const { label, icon: Icon, colorClass } = FIRE_OUTCOME_STYLES[fire.outcome];

    return (
        <span className={`inline-flex items-center gap-1 ${colorClass}`}>
            <Icon aria-hidden className="size-3.5" />
            {prefix}
            {label}
        </span>
    );
}

function TriggerHistoryContent({ trigger }: { trigger: Trigger }): JSX.Element {
    const historyQuery = useTriggerHistory(trigger.id, HISTORY_PAGE_SIZE);

    if (historyQuery.isPending) {
        return <Skeleton className="h-24" />;
    }
    if (historyQuery.isError) {
        return (
            <EmptyState
                icon={CircleAlert}
                title="Não foi possível carregar o histórico"
                description={historyQuery.error.message}
            />
        );
    }
    if (historyQuery.data.length === 0) {
        return <EmptyState icon={History} title="Nenhum disparo ainda" />;
    }

    return (
        <ol className="flex flex-col divide-y divide-border">
            {historyQuery.data.map((fire) => (
                <FireEntry key={fire.id} fire={fire} projectId={trigger.projectId} />
            ))}
        </ol>
    );
}

function FireEntry({ fire, projectId }: { fire: TriggerFire; projectId: string }): JSX.Element {
    return (
        <li className="flex flex-col gap-1 py-2">
            <div className="flex items-center justify-between gap-2">
                <FireOutcome fire={fire} />
                <span className="text-xs text-muted">{formatDateTime(new Date(fire.at))}</span>
            </div>
            {fire.message && <p className="text-muted">{fire.message}</p>}
            {fire.runId && (
                <Link to={runPath(projectId, fire.runId)} className="text-steel hover:underline">
                    Abrir run
                </Link>
            )}
        </li>
    );
}
