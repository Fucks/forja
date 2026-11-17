import type { JSX } from "react";

import { FieldHelp } from "@/web/canvas/inspector/field_help.js";
import type { FieldDoc } from "@/web/docs/node_docs/node_doc.js";

// The label of a control that is not a single input, such as option cards or an editor.
export function FieldHeading({ doc }: { doc: FieldDoc }): JSX.Element {
    return (
        <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-text">{doc.label}</span>
            <FieldHelp doc={doc} />
        </div>
    );
}
