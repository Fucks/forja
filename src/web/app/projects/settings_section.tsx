import { useId } from "react";
import type { JSX, ReactNode } from "react";

import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";

export function SettingsSection({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: ReactNode;
}): JSX.Element {
    const headingId = useId();

    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-3">
            <div>
                <h2 id={headingId} className="font-condensed text-lg font-semibold">
                    {title}
                </h2>
                {description && <p className="text-sm text-muted">{description}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        </section>
    );
}

export function SettingField({
    label,
    fieldText,
    defaultLabel,
    onChange,
    inputType = "text",
    mono = false,
}: {
    label: string;
    fieldText: string;
    defaultLabel: string | number;
    onChange: (fieldText: string) => void;
    inputType?: "text" | "number";
    mono?: boolean;
}): JSX.Element {
    const inputId = useId();

    return (
        <Field label={label} htmlFor={inputId}>
            <Input
                type={inputType}
                mono={mono}
                value={fieldText}
                placeholder={describeDefault(defaultLabel)}
                onChange={(event) => onChange(event.target.value)}
            />
        </Field>
    );
}

export function describeDefault(defaultLabel: string | number): string {
    return `padrão: ${defaultLabel}`;
}
