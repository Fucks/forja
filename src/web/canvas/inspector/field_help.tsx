import { useId, useRef, useState } from "react";
import type { JSX, KeyboardEvent } from "react";

import { cn } from "@/web/components/ui/cn.js";
import { FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";
import type { FieldDoc, FieldOptionDoc } from "@/web/docs/node_docs/node_doc.js";

const HELP_SYMBOL = "ⓘ";

export function FieldHelp({ doc }: { doc: FieldDoc }): JSX.Element {
    const helpId = useId();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [isOpen, setIsOpen] = useState(false);

    function closeOnEscape(event: KeyboardEvent): void {
        if (event.key !== "Escape" || !isOpen) {
            return;
        }

        event.stopPropagation();
        setIsOpen(false);
        buttonRef.current?.focus();
    }

    return (
        <span className="relative inline-flex" onKeyDown={closeOnEscape}>
            <button
                ref={buttonRef}
                type="button"
                aria-label={`Ajuda sobre ${doc.label}`}
                aria-expanded={isOpen}
                aria-controls={helpId}
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "rounded-sm px-0.5 text-xs text-muted hover:text-text",
                    FOCUS_RING_CLASSES,
                )}
            >
                {HELP_SYMBOL}
            </button>
            {isOpen && <FieldHelpPanel id={helpId} doc={doc} />}
        </span>
    );
}

function FieldHelpPanel({ id, doc }: { id: string; doc: FieldDoc }): JSX.Element {
    return (
        <div
            id={id}
            role="dialog"
            aria-label={doc.label}
            className="absolute top-full left-0 z-50 mt-1 flex w-64 flex-col gap-2 rounded-sm border border-border bg-surface-raised p-3 text-xs font-normal text-text shadow-float"
        >
            <p>{doc.description}</p>
            {doc.defaultValue && <p className="text-muted">Padrão: {doc.defaultValue}</p>}
            {doc.options && <FieldHelpOptions options={doc.options} />}
        </div>
    );
}

function FieldHelpOptions({ options }: { options: FieldOptionDoc[] }): JSX.Element {
    return (
        <ul aria-label="Opções" className="flex flex-col gap-1 border-l border-border pl-2">
            {options.map((option) => (
                <li key={option.value}>
                    <span className="font-medium">{option.label}</span> — {option.description}
                </li>
            ))}
        </ul>
    );
}
