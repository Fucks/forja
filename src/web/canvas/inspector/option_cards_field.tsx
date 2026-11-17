import type { JSX } from "react";

import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import { OptionCards } from "@/web/canvas/inspector/option_cards.js";
import type { OptionCard } from "@/web/canvas/inspector/option_cards.js";
import type { FieldDoc } from "@/web/docs/node_docs/node_doc.js";

export function OptionCardsField<T extends string>({
    doc,
    value,
    options,
    onChange,
}: {
    doc: FieldDoc;
    value: T;
    options: OptionCard<T>[];
    onChange: (value: T) => void;
}): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <FieldHeading doc={doc} />
            <OptionCards label={doc.label} value={value} options={options} onChange={onChange} />
        </div>
    );
}
