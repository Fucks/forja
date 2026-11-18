import type { JSX, ReactNode } from "react";

import { FieldHelp } from "@/web/canvas/inspector/field_help.js";
import { FieldHint } from "@/web/canvas/inspector/field_hint.js";
import { Switch } from "@/web/components/ui/switch.js";
import type { FieldDoc } from "@/web/docs/node_docs/node_doc.js";

export function SwitchField({
    doc,
    checked,
    hint,
    onChange,
}: {
    doc: FieldDoc;
    checked: boolean;
    hint?: ReactNode;
    onChange: (checked: boolean) => void;
}): JSX.Element {
    const labeledSwitch = (
        <div className="flex items-center gap-1">
            <Switch label={doc.label} checked={checked} onChange={onChange} />
            <FieldHelp doc={doc} />
        </div>
    );
    if (hint === undefined) {
        return labeledSwitch;
    }

    return (
        <div className="flex flex-col gap-1">
            {labeledSwitch}
            <FieldHint>{hint}</FieldHint>
        </div>
    );
}
