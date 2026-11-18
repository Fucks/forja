import { useState } from "react";
import type { JSX } from "react";

import { DataPicker } from "@/web/canvas/inspector/data_picker.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import { toOptionalText } from "@/web/canvas/inspector/text_field.js";
import type { FieldDoc } from "@/web/docs/node_docs/node_doc.js";

// Typing only edits the field; the path is applied when a field is picked or the typing ends.
export function DataPathField({
    doc,
    path,
    fields,
    onChange,
}: {
    doc: FieldDoc;
    path: string | undefined;
    fields: PickableDataField[];
    onChange: (path: string | undefined) => void;
}): JSX.Element {
    const [typedPath, setTypedPath] = useState(path ?? "");

    function pickPath(pickedPath: string): void {
        setTypedPath(pickedPath);
        onChange(pickedPath);
    }

    return (
        <div className="flex flex-col gap-1">
            <FieldHeading doc={doc} />
            <DataPicker
                label={doc.label}
                path={typedPath}
                fields={fields}
                onPick={pickPath}
                onType={setTypedPath}
                onTypingDone={() => onChange(toOptionalText(typedPath))}
            />
        </div>
    );
}
