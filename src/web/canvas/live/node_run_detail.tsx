import { useState } from "react";
import type { JSX } from "react";

import type { NodeRunError } from "@/engine/node_run_state.js";
import type { SerializedNodeRun, SerializedNodeRunDetail } from "@/shared/run_types.js";
import { JsonView } from "@/web/canvas/live/json_view.js";
import { NodeRunActionButtons } from "@/web/canvas/live/node_run_action_buttons.js";
import { NodeRunArtifacts } from "@/web/canvas/live/node_run_artifacts.js";
import { NODE_RUN_ERROR_LABELS } from "@/web/canvas/live/node_run_error_labels.js";
import { describeNodeRun } from "@/web/canvas/live/node_run_sorting.js";
import { useNodeRunDetail } from "@/web/canvas/live/use_node_run_detail.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";
import { Tabs } from "@/web/components/ui/tabs.js";

type DetailTab = "logs" | "inputs" | "outputs" | "artifacts";

export function NodeRunDetail({ nodeRun }: { nodeRun: SerializedNodeRun }): JSX.Element {
    const description = describeNodeRun(nodeRun);

    return (
        <article aria-label={description} className="flex flex-col gap-3">
            <header className="flex items-center gap-2">
                <StatusBadge status={nodeRun.status} size="sm" />
                <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{description}</h3>
                <NodeRunActionButtons nodeRun={nodeRun} />
            </header>
            <NodeRunDetailContent nodeRun={nodeRun} />
        </article>
    );
}

function NodeRunDetailContent({ nodeRun }: { nodeRun: SerializedNodeRun }): JSX.Element {
    const { data: detail, error } = useNodeRunDetail(nodeRun);
    if (error) {
        return (
            <p role="alert" className="text-sm text-status-failed">
                {error.message}
            </p>
        );
    }
    if (!detail) {
        return <Skeleton className="h-32" />;
    }

    return (
        <>
            {detail.nodeRun.error && <NodeRunErrorNotice error={detail.nodeRun.error} />}
            <NodeRunTabs detail={detail} />
        </>
    );
}

function NodeRunErrorNotice({ error }: { error: NodeRunError }): JSX.Element {
    return (
        <section
            aria-label="Erro"
            className="rounded-sm border border-status-failed p-2 text-sm text-status-failed"
        >
            <p className="font-medium">{NODE_RUN_ERROR_LABELS[error.kind]}</p>
            <p className="whitespace-pre-wrap">{error.message}</p>
        </section>
    );
}

function NodeRunTabs({ detail }: { detail: SerializedNodeRunDetail }): JSX.Element {
    const [tab, setTab] = useState<DetailTab>("inputs");
    const { nodeRun, artifacts } = detail;

    return (
        <Tabs
            label="Detalhes da execução"
            value={tab}
            onValueChange={setTab}
            tabs={[
                {
                    value: "logs",
                    label: "Logs",
                    content: <MissingValue text="Sem logs por enquanto." />,
                },
                {
                    value: "inputs",
                    label: "Entradas",
                    content: <JsonSection label="Entradas" value={nodeRun.inputs} />,
                },
                {
                    value: "outputs",
                    label: "Saídas",
                    content: <JsonSection label="Saídas" value={nodeRun.outputs} />,
                },
                {
                    value: "artifacts",
                    label: "Artefatos",
                    content: <NodeRunArtifacts artifacts={artifacts} />,
                },
            ]}
        />
    );
}

function JsonSection({ label, value }: { label: string; value?: unknown }): JSX.Element {
    if (value === undefined) {
        return <MissingValue text={`Sem ${label.toLowerCase()} nesta execução.`} />;
    }

    return <JsonView label={label} value={value} />;
}

function MissingValue({ text }: { text: string }): JSX.Element {
    return <p className="text-sm text-muted">{text}</p>;
}
