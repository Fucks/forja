import { Download } from "lucide-react";
import type { JSX } from "react";

import { DRAFT_VERSION } from "@/shared/flow_types.js";
import type { ExportedFlowVersion, FlowSummary } from "@/shared/flow_types.js";
import { toApiUrl } from "@/web/api/api_client.js";
import { flowPath } from "@/web/app/flows/use_flow_versions.js";
import { DRAFT_LABEL, versionLabel } from "@/web/app/flows/use_version_comparison.js";

const MENU_ITEM_CLASSES = "block rounded-sm px-2 py-1 whitespace-nowrap hover:bg-surface-raised";

/** The server names the downloaded file `<slug>.forja.yaml`. */
export function ExportFlowMenu({ flow }: { flow: FlowSummary }): JSX.Element {
    const { latestVersion } = flow;

    return (
        <details className="relative">
            <summary
                aria-label={`Exportar ${flow.name}`}
                className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium hover:bg-surface-raised"
            >
                <Download aria-hidden className="size-4" />
                Exportar
            </summary>
            <div className="absolute right-0 z-10 mt-1 flex flex-col rounded-md border border-border bg-surface p-1 shadow-lg">
                {latestVersion !== undefined && (
                    <a
                        download
                        href={exportUrl(flow.id, latestVersion)}
                        className={MENU_ITEM_CLASSES}
                    >
                        {`Versão publicada (${versionLabel(latestVersion)})`}
                    </a>
                )}
                <a download href={exportUrl(flow.id, DRAFT_VERSION)} className={MENU_ITEM_CLASSES}>
                    {DRAFT_LABEL}
                </a>
            </div>
        </details>
    );
}

function exportUrl(flowId: string, version: ExportedFlowVersion): string {
    return toApiUrl(`${flowPath(flowId)}/export?version=${version}`);
}
