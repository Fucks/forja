import type { JSX } from "react";

import { FieldHelp } from "@/web/canvas/inspector/field_help.js";
import { Switch } from "@/web/components/ui/switch.js";
import type { FieldDoc } from "@/web/docs/node_docs/node_doc.js";

export function SwitchField({
    doc,
    checked,
    onChange,
}: {
    doc: FieldDoc;
    checked: boolean;
    onChange: (checked: boolean) => void;
}): JSX.Element {
    return (
        <div className="flex items-center gap-1">
            <Switch label={doc.label} checked={checked} onChange={onChange} />
            <FieldHelp doc={doc} />
        </div>
    );
}
