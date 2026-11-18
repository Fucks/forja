import { Layers, Repeat } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { InvalidMarker, outlineClasses } from "@/web/canvas/base/canvas_outline.js";
import { PortHandle } from "@/web/canvas/base/port_handle.js";
import type { PortView } from "@/web/canvas/base/port_handle.js";
import { cn } from "@/web/components/ui/cn.js";

type GroupKind = "loop" | "map";

export interface GroupProgress {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
}

export interface GroupFrameProps {
    kind: GroupKind;
    label: string;
    configLabel: string;
    progress?: GroupProgress;
    selected?: boolean;
    invalid?: boolean;
    isEmpty?: boolean;
    /** Shown in the tooltip of the invalid marker. */
    issueMessages?: string[];
    outputs?: PortView[];
}

export const GROUP_KIND_ICONS: Record<GroupKind, LucideIcon> = {
    loop: Repeat,
    map: Layers,
};

const KIND_ICON_SIZE_PX = 14;
const COUNTER_SEPARATOR = " · ";
const EMPTY_GROUP_HINT = "Arraste nós para dentro";

export function GroupFrame({
    kind,
    label,
    configLabel,
    progress,
    selected,
    invalid,
    isEmpty,
    issueMessages,
    outputs = [],
}: GroupFrameProps): JSX.Element {
    const KindIcon = GROUP_KIND_ICONS[kind];

    return (
        <div
            role="group"
            aria-label={label}
            className={cn(
                "h-full w-full rounded-md border-dashed",
                outlineClasses({ selected, invalid }),
            )}
        >
            <div className="flex flex-col gap-1 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 whitespace-nowrap">
                    <KindIcon size={KIND_ICON_SIZE_PX} aria-hidden="true" className="text-steel" />
                    <span className="font-medium text-text">{label}</span>
                    <span className="font-mono text-muted">{configLabel}</span>
                    {invalid && <InvalidMarker messages={issueMessages} />}
                </div>
                {progress && <span className="text-muted">{formatGroupProgress(progress)}</span>}
                {isEmpty && <span className="text-muted">{EMPTY_GROUP_HINT}</span>}
            </div>
            {outputs.map((output) => (
                <PortHandle key={output.name} side="right" {...output} />
            ))}
        </div>
    );
}

function formatGroupProgress({ queued, running, succeeded, failed }: GroupProgress): string {
    const counters = [
        { count: running, text: `${running} rodando` },
        { count: queued, text: `${queued} na fila` },
        { count: succeeded, text: `${succeeded} ${succeeded === 1 ? "feito" : "feitos"}` },
        { count: failed, text: `${failed} com falha` },
    ];

    return counters
        .filter(({ count }) => count > 0)
        .map(({ text }) => text)
        .join(COUNTER_SEPARATOR);
}
