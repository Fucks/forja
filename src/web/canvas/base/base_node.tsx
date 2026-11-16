import { CircleHelp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";

import { InvalidMarker, outlineClasses } from "@/web/canvas/base/canvas_outline.js";
import { PortHandle } from "@/web/canvas/base/port_handle.js";
import type { PortView } from "@/web/canvas/base/port_handle.js";
import { cn } from "@/web/components/ui/cn.js";
import { EXECUTION_STATUS_STYLES } from "@/web/components/ui/execution_status.js";
import type { ExecutionStatus } from "@/web/components/ui/execution_status.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";

const TYPE_ICON_SIZE_PX = 16;

interface InputPort extends PortView {
    required: boolean;
    badge?: ReactNode;
}

export interface BaseNodeProps {
    typeIcon: LucideIcon;
    typeLabel: string;
    label: string;
    summary?: ReactNode;
    inputs: InputPort[];
    outputs: PortView[];
    status?: ExecutionStatus;
    badge?: ReactNode;
    /** Shown above the summary, such as a badge about missing configuration. */
    notice?: ReactNode;
    selected?: boolean;
    invalid?: boolean;
    /** Shown in the tooltip of the invalid marker. */
    issueMessages?: string[];
    onShowDocumentation?: () => void;
    /** Zoom below 50%: only the header is drawn. */
    compact?: boolean;
}

export function BaseNode(props: BaseNodeProps): JSX.Element {
    const { label, status, selected, invalid, compact = false } = props;
    const isGlowing = status !== undefined && EXECUTION_STATUS_STYLES[status].animated;

    return (
        <div
            role="group"
            aria-label={label}
            className={cn(
                "w-60 rounded-md bg-surface text-text",
                outlineClasses({ selected, invalid }),
                isGlowing && "animate-ember",
            )}
        >
            <NodeHeader {...props} />
            {!compact && <NodeBody {...props} />}
        </div>
    );
}

function NodeHeader({
    typeIcon: TypeIcon,
    typeLabel,
    label,
    status,
    badge,
    invalid,
    issueMessages,
    onShowDocumentation,
}: BaseNodeProps): JSX.Element {
    return (
        <header className="flex items-center gap-2 px-3 py-2">
            <TypeIcon size={TYPE_ICON_SIZE_PX} aria-hidden="true" className="shrink-0 text-steel" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs text-muted">{typeLabel}</span>
                <span className="truncate font-medium">{label}</span>
            </div>
            {invalid && <InvalidMarker messages={issueMessages} />}
            {badge !== undefined && <span className="font-mono text-xs text-muted">{badge}</span>}
            {status && <StatusBadge status={status} size="sm" showLabel={false} />}
            {onShowDocumentation && (
                <IconButton
                    label={`Documentação de ${typeLabel}`}
                    icon={CircleHelp}
                    onClick={onShowDocumentation}
                    className="nodrag h-6 shrink-0 text-muted"
                />
            )}
        </header>
    );
}

function NodeBody({ notice, summary, inputs, outputs }: BaseNodeProps): JSX.Element {
    return (
        <div className="flex flex-col gap-2 border-t border-border py-2">
            {notice !== undefined && <div className="px-3">{notice}</div>}
            {summary !== undefined && (
                <div className="px-3 font-mono text-xs text-muted">{summary}</div>
            )}
            <div className="grid grid-cols-2">
                <div className="flex min-w-0 flex-col">
                    {inputs.map((input) => (
                        <PortHandle key={input.name} side="left" {...input} />
                    ))}
                </div>
                <div className="flex min-w-0 flex-col">
                    {outputs.map((output) => (
                        <PortHandle key={output.name} side="right" required {...output} />
                    ))}
                </div>
            </div>
        </div>
    );
}
