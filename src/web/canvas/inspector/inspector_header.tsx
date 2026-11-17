import { BookOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import { GROUP_KIND_ICONS } from "@/web/canvas/base/group_frame.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { InlineTextInput } from "@/web/canvas/inspector/text_field.js";
import { Button } from "@/web/components/ui/button.js";
import { NodeDocDrawer } from "@/web/docs/node_doc_drawer.js";
import type { DocumentedType } from "@/web/docs/node_docs/node_doc.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

const DOCUMENTED_TYPE_ICONS: Record<DocumentedType, LucideIcon> = {
    ...NODE_TYPE_ICONS,
    ...GROUP_KIND_ICONS,
};

const TYPE_ICON_SIZE_PX = 16;

export function InspectorHeader({
    type,
    label,
    onLabelChange,
}: {
    type: DocumentedType;
    label: string;
    onLabelChange: (label: string) => void;
}): JSX.Element {
    const doc = getNodeDoc(type);
    const TypeIcon = DOCUMENTED_TYPE_ICONS[type];

    return (
        <header className="flex flex-col gap-1 px-3 pb-2">
            <div className="flex items-center gap-2">
                <TypeIcon size={TYPE_ICON_SIZE_PX} aria-hidden="true" className="shrink-0" />
                <InlineTextInput label="Rótulo" text={label} onChange={onLabelChange} />
                <DocumentationButton type={type} />
            </div>
            <p className="truncate text-xs text-muted" title={doc.tagline}>
                <span className="font-medium text-text">{doc.title}</span> ·{" "}
                <span>{doc.tagline}</span>
            </p>
        </header>
    );
}

function DocumentationButton({ type }: { type: DocumentedType }): JSX.Element {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(true)}>
                <BookOpen aria-hidden="true" className="size-4" />
                Documentação
            </Button>
            <NodeDocDrawer type={type} open={isOpen} onOpenChange={setIsOpen} />
        </>
    );
}
