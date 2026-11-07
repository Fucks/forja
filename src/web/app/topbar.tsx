import type { JSX } from "react";

export function Topbar({
    projectId,
    connected,
}: {
    projectId: string | undefined;
    connected: boolean;
}): JSX.Element {
    return (
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
            <span className="font-medium">{projectId ?? "Forja"}</span>
            <span>{connected ? "ao vivo" : "desconectado"}</span>
        </header>
    );
}
