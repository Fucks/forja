import { AlertTriangle } from "lucide-react";
import type { JSX } from "react";

import { Tooltip } from "@/web/components/ui/tooltip.js";

const INVALID_ICON_SIZE_PX = 14;

export function outlineClasses({
    selected = false,
    invalid = false,
}: {
    selected?: boolean;
    invalid?: boolean;
}): string {
    if (invalid) {
        return "border-[1.5px] border-status-failed";
    }

    if (selected) {
        return "border-[1.5px] border-accent";
    }

    return "border border-border";
}

export function InvalidMarker({ messages = [] }: { messages?: string[] }): JSX.Element {
    const icon = (
        <AlertTriangle
            role="img"
            aria-label="Configuração inválida"
            size={INVALID_ICON_SIZE_PX}
            className="shrink-0 text-status-failed"
        />
    );
    if (messages.length === 0) {
        return icon;
    }

    return (
        <Tooltip content={<MessageList messages={messages} />}>
            <span className="flex">{icon}</span>
        </Tooltip>
    );
}

function MessageList({ messages }: { messages: string[] }): JSX.Element {
    return (
        <ul className="flex max-w-xs flex-col gap-1">
            {messages.map((message) => (
                <li key={message}>{message}</li>
            ))}
        </ul>
    );
}
