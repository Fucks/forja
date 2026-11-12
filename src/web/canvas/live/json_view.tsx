import { Copy } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import { Button } from "@/web/components/ui/button.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { copyToClipboard } from "@/web/logs/log_clipboard.js";

const LONG_STRING_PREVIEW_LENGTH = 200;
const JSON_INDENT_SPACES = 2;

type JsonContainer = Record<string, unknown> | unknown[];

export function JsonView({ label, value }: { label: string; value: unknown }): JSX.Element {
    return (
        <section aria-label={label} className="relative font-mono text-xs">
            <IconButton
                label={`Copiar ${label.toLowerCase()}`}
                icon={Copy}
                onClick={() => void copyToClipboard(formatJson(value))}
                className="absolute top-0 right-0 h-6"
            />
            <JsonEntry value={value} />
        </section>
    );
}

function formatJson(value: unknown): string {
    return JSON.stringify(value, null, JSON_INDENT_SPACES);
}

function JsonEntry({ name, value }: { name?: string; value: unknown }): JSX.Element {
    if (isJsonContainer(value)) {
        return <JsonContainerEntry name={name} container={value} />;
    }

    return (
        <div className="break-all">
            {name !== undefined && <JsonKey name={name} />}
            <JsonScalar value={value} />
        </div>
    );
}

function isJsonContainer(value: unknown): value is JsonContainer {
    return typeof value === "object" && value !== null;
}

function JsonContainerEntry({
    name,
    container,
}: {
    name?: string;
    container: JsonContainer;
}): JSX.Element {
    const entries = Object.entries(container);

    return (
        <details open>
            <summary className="cursor-pointer">
                {name !== undefined && <JsonKey name={name} />}
                <span className="text-muted">{describeContainer(container)}</span>
            </summary>
            <div className="border-l border-border pl-4">
                {entries.map(([entryName, entryValue]) => (
                    <JsonEntry key={entryName} name={entryName} value={entryValue} />
                ))}
            </div>
        </details>
    );
}

function describeContainer(container: JsonContainer): string {
    const size = Object.keys(container).length;
    return Array.isArray(container) ? `[ ${size} ]` : `{ ${size} }`;
}

function JsonKey({ name }: { name: string }): JSX.Element {
    return <span className="text-accent">{name}: </span>;
}

function JsonScalar({ value }: { value: unknown }): JSX.Element {
    if (typeof value === "string") {
        return <JsonString text={value} />;
    }

    return <span className="text-status-queued">{String(value)}</span>;
}

function JsonString({ text }: { text: string }): JSX.Element {
    const [isShowingAll, setIsShowingAll] = useState(false);
    const isLong = text.length > LONG_STRING_PREVIEW_LENGTH;
    if (!isLong || isShowingAll) {
        return <span>{JSON.stringify(text)}</span>;
    }

    return (
        <>
            <span>{`${JSON.stringify(text.slice(0, LONG_STRING_PREVIEW_LENGTH))}…`}</span>
            <Button variant="ghost" size="sm" onClick={() => setIsShowingAll(true)}>
                ver tudo
            </Button>
        </>
    );
}
