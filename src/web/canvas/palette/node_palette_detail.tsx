import { CircleStop } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX, RefObject } from "react";

import type { Position } from "@/shared/flow_graph.js";
import { PORT_TYPE_ICONS } from "@/web/canvas/base/port_type_icons.js";
import { cn } from "@/web/components/ui/cn.js";
import { FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";
import type { NodeDoc, PortDoc } from "@/web/docs/node_docs/node_doc.js";

const PORT_ICON_SIZE_PX = 14;

const PORT_DOC_TYPE_ICONS: Record<PortDoc["type"], LucideIcon> = {
    ...PORT_TYPE_ICONS,
    loopExhausted: CircleStop,
};

export function NodePaletteDetail({
    cardRef,
    docsButtonRef,
    doc,
    position,
    onOpenDocumentation,
}: {
    cardRef: RefObject<HTMLDivElement | null>;
    docsButtonRef: RefObject<HTMLButtonElement | null>;
    doc: NodeDoc;
    position: Position;
    onOpenDocumentation: () => void;
}): JSX.Element {
    const [firstExample] = doc.examples;

    return (
        <div
            ref={cardRef}
            role="dialog"
            aria-label={`Detalhes de ${doc.title}`}
            style={{ left: position.x, top: position.y }}
            className="fixed z-50 flex w-80 flex-col gap-2 rounded-md border border-border bg-surface-raised p-3 text-xs text-text shadow-float"
        >
            <p className="font-medium">{doc.tagline}</p>
            <p className="text-muted">{doc.whatItDoes}</p>
            <PortList caption="Entradas" ports={doc.ports.inputs} />
            <PortList caption="Saídas" ports={doc.ports.outputs} />
            {firstExample && (
                <p>
                    <span className="font-medium">Exemplo: {firstExample.title}.</span>{" "}
                    <span className="text-muted">{firstExample.description}</span>
                </p>
            )}
            <button
                ref={docsButtonRef}
                type="button"
                onClick={onOpenDocumentation}
                className={cn(
                    "self-start rounded-sm text-accent underline-offset-2 hover:underline",
                    FOCUS_RING_CLASSES,
                )}
            >
                Documentação completa
            </button>
        </div>
    );
}

function PortList({ caption, ports }: { caption: string; ports: PortDoc[] }): JSX.Element {
    if (ports.length === 0) {
        return (
            <p>
                <span className="font-medium">{caption}:</span>{" "}
                <span className="text-muted">nenhuma</span>
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            <p className="font-medium">{caption}</p>
            <ul aria-label={caption} className="flex flex-col gap-1">
                {ports.map((port) => (
                    <PortListEntry key={port.name} port={port} />
                ))}
            </ul>
        </div>
    );
}

function PortListEntry({ port }: { port: PortDoc }): JSX.Element {
    const TypeIcon = PORT_DOC_TYPE_ICONS[port.type];

    return (
        <li className="flex items-center gap-1.5">
            <TypeIcon size={PORT_ICON_SIZE_PX} aria-hidden="true" className="text-steel" />
            {port.label}
        </li>
    );
}
