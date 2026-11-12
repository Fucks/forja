import { History, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";
import { Link, useParams } from "react-router";

import { assertNever } from "@/lib/assert_never.js";
import type { FlowVersionSummary } from "@/shared/flow_types.js";
import { ComparisonTargetPicker } from "@/web/app/flows/comparison_target_picker.js";
import { RestoreVersionDialog } from "@/web/app/flows/restore_version_dialog.js";
import { useFlowVersions } from "@/web/app/flows/use_flow_versions.js";
import { useVersionComparison } from "@/web/app/flows/use_version_comparison.js";
import type { ComparisonTarget } from "@/web/app/flows/use_version_comparison.js";
import { VersionList } from "@/web/app/flows/version_list.js";
import { VersionDiffView } from "@/web/app/flows/version_diff_view.js";
import { PageTitle } from "@/web/app/page_title.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { flowEditorPath } from "@/web/config/navigation.js";

export function VersionsPage(): JSX.Element {
    const { projectId = "", flowId = "" } = useParams();

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <header className="flex items-baseline justify-between gap-4">
                <PageTitle>Versões do fluxo</PageTitle>
                <Button asChild variant="ghost" size="sm">
                    <Link to={flowEditorPath(projectId, flowId)}>Voltar ao editor</Link>
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
    flowId,
    versions,
}: {
    flowId: string;
    versions: FlowVersionSummary[];
}): JSX.Element {
    const [selectedVersion, setSelectedVersion] = useState(findLatestVersion(versions));
    const [target, setTarget] = useState<ComparisonTarget>("previous");
    const previousVersion = findPreviousVersion(versions, selectedVersion);
    const comparedTarget = previousVersion === undefined ? "draft" : target;

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border">
            <VersionList
                versions={versions}
                selectedVersion={selectedVersion}
                onSelect={setSelectedVersion}
            />
            <section aria-label="Comparação" className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-end gap-3 border-b border-border bg-surface px-3 py-2">
                    <ComparisonTargetPicker
                        target={comparedTarget}
                        previousVersion={previousVersion}
                        onChange={setTarget}
                    />
                    <RestoreVersionButton flowId={flowId} version={selectedVersion} />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <VersionComparisonResult
                        flowId={flowId}
                        selectedVersion={selectedVersion}
                        previousVersion={previousVersion}
                        target={comparedTarget}
                    />
                </div>
            </section>
        </div>
    );
}

function RestoreVersionButton({
    flowId,
    version,
}: {
    flowId: string;
    version: number;
}): JSX.Element {
    const [isConfirming, setIsConfirming] = useState(false);

    return (
        <>
            <Button className="ml-auto" onClick={() => setIsConfirming(true)}>
                Restaurar no rascunho
            </Button>
            {isConfirming && (
                <RestoreVersionDialog
                    flowId={flowId}
                    version={version}
                    onClose={() => setIsConfirming(false)}
                />
            )}
        </>
    );
}

function VersionComparisonResult(props: {
    flowId: string;
    selectedVersion: number;
    previousVersion: number | undefined;
    target: ComparisonTarget;
}): JSX.Element {
    const comparison = useVersionComparison(props);

    switch (comparison.status) {
        case "loading":
            return <Skeleton className="m-4 h-40" />;
        case "failed":
            return (
                <EmptyState
                    icon={TriangleAlert}
                    title="Não foi possível comparar as versões"
                    description={comparison.message}
                />
            );
        case "ready":
            return <VersionDiffView before={comparison.before} after={comparison.after} />;
        default:
            return assertNever(comparison);
    }
}

function findLatestVersion(versions: FlowVersionSummary[]): number {
    return Math.max(...versions.map((version) => version.version));
}

function findPreviousVersion(
    versions: FlowVersionSummary[],
    selectedVersion: number,
): number | undefined {
    const olderVersions = versions
        .map((version) => version.version)
        .filter((version) => version < selectedVersion);

    return olderVersions.length === 0 ? undefined : Math.max(...olderVersions);
}
