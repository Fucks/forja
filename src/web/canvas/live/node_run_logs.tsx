import { Maximize2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { JSX } from "react";

import type { SerializedNodeRun } from "@/shared/run_types.js";
import { toApiUrl } from "@/web/api/api_client.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { renderAgentEventLine } from "@/web/logs/event_renderers.js";
import { DEFAULT_LOG_FILTER, filterLogLines, LogFilterControl } from "@/web/logs/log_filters.js";
import type { LogFilter } from "@/web/logs/log_filters.js";
import { LogViewer } from "@/web/logs/log_viewer.js";
import { useNodeRunLogs } from "@/web/logs/use_node_run_logs.js";

export function NodeRunLogs({ nodeRun }: { nodeRun: SerializedNodeRun }): JSX.Element {
    const { lines, loading, error } = useNodeRunLogs(nodeRun.id, nodeRun.runId);
    const [filter, setFilter] = useState<LogFilter>(DEFAULT_LOG_FILTER);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const visibleLines = useMemo(() => filterLogLines(lines, filter), [lines, filter]);

    if (error) {
        return (
            <p role="alert" className="text-sm text-status-failed">
                {error.message}
            </p>
        );
    }

    const viewer = (
        <LogViewer
            lines={visibleLines}
            loading={loading}
            renderLine={renderAgentEventLine}
            onDownloadRaw={() => downloadRawLogs(nodeRun.id)}
            emptyLabel="Sem logs por enquanto."
        />
    );

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <LogFilterControl value={filter} onChange={setFilter} />
                <Button onClick={() => setIsFullScreen(true)}>
                    <Maximize2 aria-hidden className="size-4" />
                    Tela cheia
                </Button>
            </div>
            <div className="h-96 overflow-hidden rounded-sm border border-border">{viewer}</div>
            <Dialog open={isFullScreen} onOpenChange={setIsFullScreen} title="Logs" size="lg">
                <div className="mt-3 h-[70vh]">{viewer}</div>
            </Dialog>
        </div>
    );
}

// The server answers with an attachment, so the browser saves the file instead of navigating.
function downloadRawLogs(nodeRunId: string): void {
    const link = document.createElement("a");
    link.href = toApiUrl(`/node-runs/${encodeURIComponent(nodeRunId)}/logs/raw`);
    link.download = "";
    link.click();
}
