import { Archive, Pencil, Star } from "lucide-react";
import type { JSX } from "react";
import { Link } from "react-router";

import { formatDateTime } from "@/lib/format.js";
import type { FlowSummary } from "@/shared/flow_types.js";
import type { ApiError } from "@/web/api/api_client.js";
import { ExportFlowMenu } from "@/web/app/flows/export_flow_menu.js";
import { useArchiveFlow, useSetDefaultFlow } from "@/web/app/flows/use_flows.js";
import { versionLabel } from "@/web/app/flows/use_version_comparison.js";
import { cn } from "@/web/components/ui/cn.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { useToast } from "@/web/components/ui/toast.js";
import { flowEditorPath } from "@/web/config/navigation.js";

const UNPUBLISHED_LABEL = "Não publicado";

export function FlowsTable({
    flows,
    onRename,
}: {
    flows: FlowSummary[];
    onRename: (flow: FlowSummary) => void;
}): JSX.Element {
    return (
        <table className="w-full border-collapse text-left">
            <thead className="border-b border-border text-muted">
                <tr>
                    <th className="py-2 pr-4 font-medium">Nome</th>
                    <th className="py-2 pr-4 font-medium">Padrão</th>
                    <th className="py-2 pr-4 font-medium">Última versão</th>
                    <th className="py-2 pr-4 font-medium">Atualizado em</th>
                    <th className="py-2 font-medium">
                        <span className="sr-only">Ações</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {flows.map((flow) => (
                    <FlowRow key={flow.id} flow={flow} onRename={() => onRename(flow)} />
                ))}
            </tbody>
        </table>
    );
}

function FlowRow({ flow, onRename }: { flow: FlowSummary; onRename: () => void }): JSX.Element {
    return (
        <tr className="border-b border-border">
            <td className="py-2 pr-4">
                <Link
                    to={flowEditorPath(flow.projectId, flow.id)}
                    className="font-medium hover:text-accent"
                >
                    {flow.name}
                </Link>
                {flow.archived && <span className="ml-2 text-xs text-muted">Arquivado</span>}
            </td>
            <td className="py-2 pr-4">
                <DefaultFlowStar flow={flow} />
            </td>
            <td className="py-2 pr-4">{describeLatestVersion(flow.latestVersion)}</td>
            <td className="py-2 pr-4">{formatDateTime(new Date(flow.draftUpdatedAt))}</td>
            <td className="py-2">
                <FlowRowActions flow={flow} onRename={onRename} />
            </td>
        </tr>
    );
}

function DefaultFlowStar({ flow }: { flow: FlowSummary }): JSX.Element {
    const setDefaultFlow = useSetDefaultFlow();
    const showFailure = useFailureToast("Não foi possível marcar como padrão");

    return (
        <IconButton
            label={`Marcar ${flow.name} como padrão`}
            icon={Star}
            aria-pressed={flow.isDefault}
            disabled={flow.isDefault || flow.archived || setDefaultFlow.isPending}
            onClick={() => setDefaultFlow.mutate(flow.id, { onError: showFailure })}
            className={cn(flow.isDefault && "text-accent [&_svg]:fill-current")}
        />
    );
}

function FlowRowActions({
    flow,
    onRename,
}: {
    flow: FlowSummary;
    onRename: () => void;
}): JSX.Element {
    const archiveFlow = useArchiveFlow();
    const showFailure = useFailureToast("Não foi possível arquivar");

    return (
        <div className="flex items-center justify-end gap-1">
            <IconButton label={`Renomear ${flow.name}`} icon={Pencil} onClick={onRename} />
            <ExportFlowMenu flow={flow} />
            {!flow.archived && (
                <IconButton
                    label={`Arquivar ${flow.name}`}
                    icon={Archive}
                    disabled={archiveFlow.isPending}
                    onClick={() => archiveFlow.mutate(flow.id, { onError: showFailure })}
                />
            )}
        </div>
    );
}

function useFailureToast(title: string): (error: ApiError) => void {
    const toast = useToast();

    return (error) => toast.show({ title, description: error.message, tone: "error" });
}

function describeLatestVersion(latestVersion: number | undefined): string {
    if (latestVersion === undefined) {
        return UNPUBLISHED_LABEL;
    }

    return versionLabel(latestVersion);
}
