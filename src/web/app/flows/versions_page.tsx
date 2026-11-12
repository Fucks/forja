import { History, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";
import { Link, useParams } from "react-router";

import { formatDateTime } from "@/lib/format.js";
import type { FlowVersionSummary } from "@/shared/flow_types.js";
import { useFlowVersions } from "@/web/app/flows/use_flow_versions.js";
import { PageTitle } from "@/web/app/page_title.js";
import { Button } from "@/web/components/ui/button.js";
import { cn } from "@/web/components/ui/cn.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

const NO_NOTE_LABEL = "Sem nota";

export function VersionsPage(): JSX.Element {
    const { projectId = "", flowId = "" } = useParams();

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <header className="flex items-baseline justify-between gap-4">
                <PageTitle>Versões do fluxo</PageTitle>
                <Button asChild variant="ghost" size="sm">
                    <Link to={editorPath(projectId, flowId)}>Voltar ao editor</Link>
                </Button>
            </header>
            <FlowVersionsBrowser key={flowId} flowId={flowId} />
        </div>
    );
}

function FlowVersionsBrowser({ flowId }: { flowId: string }): JSX.Element {
    const versionsQuery = useFlowVersions(flowId);

    if (versionsQuery.isPending) {
        return <Skeleton className="min-h-0 flex-1" />;
    }
    if (versionsQuery.isError) {
        return (
            <EmptyState
                icon={TriangleAlert}
                title="Não foi possível carregar as versões"
                description={versionsQuery.error.message}
            />
        );
    }
    if (versionsQuery.data.length === 0) {
        return (
            <EmptyState
                icon={History}
                title="Nenhuma versão publicada"
                description="Publique o rascunho no editor para criar a primeira versão."
            />
        );
    }

    return <VersionsWorkspace flowId={flowId} versions={versionsQuery.data} />;
}

function VersionsWorkspace({
    versions,
}: {
    flowId: string;
    versions: FlowVersionSummary[];
}): JSX.Element {
    const [selectedVersion, setSelectedVersion] = useState(findLatestVersion(versions));

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border">
            <VersionList
                versions={versions}
                selectedVersion={selectedVersion}
                onSelect={setSelectedVersion}
            />
        </div>
    );
}

function VersionList({
    versions,
    selectedVersion,
    onSelect,
}: {
    versions: FlowVersionSummary[];
    selectedVersion: number;
    onSelect: (version: number) => void;
}): JSX.Element {
    const newestFirst = [...versions].reverse();

    return (
        <ul
            aria-label="Versões publicadas"
            className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface"
        >
            {newestFirst.map((version) => (
                <li key={version.version}>
                    <VersionListEntry
                        version={version}
                        isSelected={version.version === selectedVersion}
                        onSelect={() => onSelect(version.version)}
                    />
                </li>
            ))}
        </ul>
    );
}

function VersionListEntry({
    version,
    isSelected,
    onSelect,
}: {
    version: FlowVersionSummary;
    isSelected: boolean;
    onSelect: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            aria-pressed={isSelected}
            onClick={onSelect}
            className={cn(
                "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left",
                isSelected ? "bg-surface-raised" : "hover:bg-surface-raised",
            )}
        >
            <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">v{version.version}</span>
                <span className="text-xs text-muted">
                    {formatDateTime(new Date(version.publishedAt))}
                </span>
            </span>
            <span className="truncate text-xs text-muted">{version.note ?? NO_NOTE_LABEL}</span>
        </button>
    );
}

function findLatestVersion(versions: FlowVersionSummary[]): number {
    return Math.max(...versions.map((version) => version.version));
}

function editorPath(projectId: string, flowId: string): string {
    return `/projects/${encodeURIComponent(projectId)}/flows/${encodeURIComponent(flowId)}`;
}
