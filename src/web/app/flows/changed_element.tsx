import type { JSX } from "react";

import type { FieldChange } from "@/engine/graph_diff.js";
import { PromptLineDiff } from "@/web/app/flows/prompt_line_diff.js";

interface PromptChange extends FieldChange {
    before: string;
    after: string;
}

const PROMPT_PATH = "config.prompt";
const EMPTY_VALUE_LABEL = "(vazio)";

/** A node or group that both graphs have, with each field that differs. */
export function ChangedElement({
    label,
    changes,
}: {
    label: string;
    changes: FieldChange[];
}): JSX.Element {
    return (
        <article aria-label={label} className="rounded-sm border border-border p-3">
            <h3 className="mb-1 font-medium">{label}</h3>
            <ul className="flex flex-col gap-1 text-sm">
                {changes.map((change) => (
                    <li key={change.path}>
                        <FieldChangeDescription change={change} />
                    </li>
                ))}
            </ul>
        </article>
    );
}

function FieldChangeDescription({ change }: { change: FieldChange }): JSX.Element {
    if (isPromptChange(change)) {
        return (
            <>
                <code className="font-mono text-xs">{change.path}</code>
                <PromptLineDiff before={change.before} after={change.after} />
            </>
        );
    }

    return (
        <>
            <code className="font-mono text-xs">{change.path}</code>: {formatValue(change.before)} →{" "}
            {formatValue(change.after)}
        </>
    );
}

function isPromptChange(change: FieldChange): change is PromptChange {
    return (
        change.path === PROMPT_PATH &&
        typeof change.before === "string" &&
        typeof change.after === "string"
    );
}

function formatValue(value: unknown): string {
    if (value === undefined) {
        return EMPTY_VALUE_LABEL;
    }
    if (typeof value === "string") {
        return value;
    }

    return JSON.stringify(value);
}
