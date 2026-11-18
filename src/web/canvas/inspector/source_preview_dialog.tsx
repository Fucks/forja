import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { JSX } from "react";

import { sourcePreviewSchema } from "@/shared/api_types.js";
import type { SourcePreview, SourcePreviewItem } from "@/shared/api_types.js";
import type { SourceConfig } from "@/shared/node_configs/source_config.js";
import type { FlowInEditor } from "@/web/canvas/inspector/use_last_node_run_sample.js";
import { apiClient } from "@/web/api/api_client.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

const DIALOG_TITLE = "O que seria buscado agora";
const SOURCE_PREVIEW_QUERY_KEY = "source-preview";
const LOADING_ROW_COUNT = 3;
const CREDENTIAL_HINT = "Verifique a credencial do GitHub em Configurações";

export function SourcePreviewDialog({
    flow,
    config,
    onClose,
}: {
    flow: FlowInEditor;
    config: SourceConfig;
    onClose: () => void;
}): JSX.Element {
    const preview = useSourcePreview(flow, config);

    return (
        <Dialog open title={DIALOG_TITLE} onOpenChange={onClose}>
            <div className="mt-3 flex flex-col gap-3 text-sm">
                <SourcePreviewContent preview={preview} config={config} />
            </div>
        </Dialog>
    );
}

// Each opening asks again: the point is what the source would take right now.
function useSourcePreview(
    { projectId, flowId }: FlowInEditor,
    config: SourceConfig,
): UseQueryResult<SourcePreview> {
    return useQuery({
        queryKey: [SOURCE_PREVIEW_QUERY_KEY, projectId, flowId, config],
        queryFn: () =>
            apiClient.post(
                `/projects/${projectId}/flows/${flowId}/source-preview`,
                { config },
                sourcePreviewSchema,
            ),
        gcTime: 0,
        retry: false,
    });
}

function SourcePreviewContent({
    preview,
    config,
}: {
    preview: UseQueryResult<SourcePreview>;
    config: SourceConfig;
}): JSX.Element {
    if (preview.isPending) {
        return <LoadingRows />;
    }
    if (preview.isError) {
        return (
            <p role="alert" className="text-status-failed">
                {preview.error.message} {CREDENTIAL_HINT}
            </p>
        );
    }

    const { items, skipped } = preview.data;
    return (
        <>
            {items.length === 0 ? (
                <p className="text-muted">{describeNothingToTake(config)}</p>
            ) : (
                <PreviewItemList items={items} />
            )}
            {skipped > 0 && <p className="text-muted">{describeSkipped(skipped)}</p>}
        </>
    );
}

function LoadingRows(): JSX.Element {
    return (
        <div role="status" aria-label="Buscando itens" className="flex flex-col gap-2">
            {Array.from({ length: LOADING_ROW_COUNT }, (_, row) => (
                <Skeleton key={row} className="h-5 w-full" />
            ))}
        </div>
    );
}

function PreviewItemList({ items }: { items: SourcePreviewItem[] }): JSX.Element {
    return (
        <ul aria-label="Itens que seriam buscados" className="flex flex-col gap-1.5">
            {items.map((item) => (
                <li key={`${item.number ?? ""}${item.title}`} className="flex items-center gap-2">
                    {item.number !== undefined && (
                        <span className="font-mono text-muted">#{item.number}</span>
                    )}
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.labels.map((label) => (
                        <span key={label} className="rounded-sm bg-border px-1.5 text-xs">
                            {label}
                        </span>
                    ))}
                </li>
            ))}
        </ul>
    );
}

function describeNothingToTake(config: SourceConfig): string {
    if (config.provider === "local") {
        return "Nenhum item aberto no board";
    }
    if (config.label === undefined) {
        return "Nenhuma issue aberta";
    }

    return `Nenhuma issue aberta com a label ${config.label}`;
}

function describeSkipped(skipped: number): string {
    if (skipped === 1) {
        return "1 issue pulada porque depende de issues abertas";
    }

    return `${skipped} issues puladas porque dependem de issues abertas`;
}
