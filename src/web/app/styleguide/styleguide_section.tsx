import { useId } from "react";
import type { JSX, ReactNode } from "react";

export function StyleguideSection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}): JSX.Element {
    const titleId = useId();

    return (
        <section
            aria-labelledby={titleId}
            className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
        >
            <h2 id={titleId} className="font-condensed text-lg font-semibold">
                {title}
            </h2>
            {children}
        </section>
    );
}

export function SampleRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}): JSX.Element {
    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs text-muted">{label}</span>
            <div className="flex flex-wrap items-center gap-3">{children}</div>
        </div>
    );
}
