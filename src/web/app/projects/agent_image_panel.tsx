import { Hammer, Square } from "lucide-react";
import type { JSX } from "react";

import { assertNever } from "@/lib/assert_never.js";
import type { AgentImageSource, AgentImageStatus } from "@/shared/agent_image_types.js";
import { useAgentImageBuild, useAgentImageStatus } from "@/web/app/projects/use_agent_image.js";
import type {
    AgentImageBuild,
    AgentImageBuildOutcome,
} from "@/web/app/projects/use_agent_image.js";
import { Button } from "@/web/components/ui/button.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";
import { LogViewer } from "@/web/logs/log_viewer.js";

const SOURCE_LABELS: Record<AgentImageSource, string> = {
    forja_default: "Dockerfile padrão da Forja",
    project_dockerfile: ".sandcastle/Dockerfile do projeto",
};

export function AgentImagePanel({ projectId }: { projectId: string }): JSX.Element {
    const build = useAgentImageBuild(projectId);
    const hasBuildLog = build.isBuilding || build.lines.length > 0;

    return (
        <div className="flex flex-col gap-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <AgentImageSummary projectId={projectId} />
                <BuildButton build={build} />
            </div>
            {build.outcome && <BuildOutcomeMessage outcome={build.outcome} />}
            {hasBuildLog && (
                <div className="h-80 overflow-hidden rounded-md border border-border">
                    <LogViewer lines={build.lines} emptyLabel="Aguardando o Docker..." />
                </div>
            )}
        </div>
    );
}

function AgentImageSummary({ projectId }: { projectId: string }): JSX.Element {
    const statusQuery = useAgentImageStatus(projectId);

    if (statusQuery.isPending) {
        return <Skeleton className="h-8 w-64" />;
    }
    if (statusQuery.isError) {
        return (
            <p role="alert" className="text-sm text-status-failed">
                Não foi possível verificar a imagem do agente.
            </p>
        );
    }

    return <AgentImageStatusView status={statusQuery.data} />;
}

function AgentImageStatusView({ status }: { status: AgentImageStatus }): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <StatusBadge status={status.exists ? "SUCCEEDED" : "FAILED"} size="sm" />
                <span className="font-mono text-sm">{status.image}</span>
            </div>
            <p className="text-xs text-muted">{describeImage(status)}</p>
        </div>
    );
}

function describeImage(status: AgentImageStatus): string {
    const source = `Fonte: ${SOURCE_LABELS[status.source]}`;
    if (!status.exists) {
        return `Imagem não encontrada. ${source}.`;
    }
    if (status.sizeMb === undefined) {
        return `${source}.`;
    }

    return `${source}. ${status.sizeMb} MB.`;
}

function BuildButton({ build }: { build: AgentImageBuild }): JSX.Element {
    if (build.isBuilding) {
        return (
            <Button onClick={build.cancel}>
                <Square aria-hidden className="size-3.5" />
                Cancelar
            </Button>
        );
    }

    return (
        <Button variant="primary" onClick={build.start}>
            <Hammer aria-hidden className="size-3.5" />
            Construir imagem
        </Button>
    );
}

function BuildOutcomeMessage({ outcome }: { outcome: AgentImageBuildOutcome }): JSX.Element {
    if (outcome.kind === "finished" && outcome.result.ok) {
        return <p className="text-sm text-status-succeeded">Imagem construída.</p>;
    }

    return (
        <p role="alert" className="text-sm text-status-failed">
            {describeUnsuccessfulBuild(outcome)}
        </p>
    );
}

function describeUnsuccessfulBuild(outcome: AgentImageBuildOutcome): string {
    switch (outcome.kind) {
        case "finished":
            return `O build falhou (código de saída ${outcome.result.exitCode}).`;
        case "cancelled":
            return "Build cancelado.";
        case "failed":
            return outcome.message;
        default:
            return assertNever(outcome);
    }
}
