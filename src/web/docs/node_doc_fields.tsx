import type { JSX } from "react";

import type { FieldDoc, FieldOptionDoc } from "@/web/docs/node_docs/node_doc.js";

export function NodeDocFields({ fields }: { fields: FieldDoc[] }): JSX.Element {
    return (
        <dl className="flex flex-col gap-4">
            {fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1">
                    <dt className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{field.label}</span>
                        <code className="font-mono text-xs text-muted">{field.key}</code>
                        {field.advanced && <span className="text-xs text-muted">avançado</span>}
                    </dt>
                    <dd className="flex flex-col gap-1">
                        <p>{field.description}</p>
                        {field.defaultValue && <FieldDefault defaultValue={field.defaultValue} />}
                        {field.options && <FieldOptions options={field.options} />}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function FieldDefault({ defaultValue }: { defaultValue: string }): JSX.Element {
    return (
        <p>
            <span className="text-muted">Padrão: </span>
            {defaultValue}
        </p>
    );
}

function FieldOptions({ options }: { options: FieldOptionDoc[] }): JSX.Element {
    return (
        <dl
            aria-label="Opções"
            className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 border-l border-border pl-3"
        >
            {options.map((option) => (
                <div key={option.value} className="contents">
                    <dt>
                        {option.label}{" "}
                        <code className="font-mono text-xs text-muted">{option.value}</code>
                    </dt>
                    <dd className="text-muted">{option.description}</dd>
                </div>
            ))}
        </dl>
    );
}
