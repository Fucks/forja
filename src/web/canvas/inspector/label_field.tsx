import type { JSX } from "react";

import { TextField } from "@/web/canvas/inspector/text_field.js";

export function LabelField({
    label,
    onChange,
}: {
    label: string;
    onChange: (label: string) => void;
}): JSX.Element {
    return (
        <div className="px-3 pb-3">
            <TextField label="Rótulo" text={label} onChange={onChange} />
        </div>
    );
}
