import type { ReactNode } from "react";

import { FieldHelp } from "@/web/canvas/inspector/field_help.js";
import type { FieldDoc } from "@/web/docs/node_docs/node_doc.js";

// A documented field takes its label from the doc and shows the ⓘ help beside it.
export type FieldLabeling =
    { label: string; doc?: undefined } | { doc: FieldDoc; label?: undefined };

interface FieldLabelParts {
    label: string;
    labelAddon: ReactNode;
}

export function describeFieldLabel(labeling: FieldLabeling): FieldLabelParts {
    if (labeling.doc === undefined) {
        return { label: labeling.label, labelAddon: undefined };
    }

    return { label: labeling.doc.label, labelAddon: <FieldHelp doc={labeling.doc} /> };
}
