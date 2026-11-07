import { clsx } from "clsx";
import type { JSX, ReactNode } from "react";

interface KeyValueItem {
    label: string;
    value: ReactNode;
    mono?: boolean;
}

export function KeyValue({ items }: { items: KeyValueItem[] }): JSX.Element {
    return (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
            {items.map((item) => (
                <div key={item.label} className="contents">
                    <dt className="text-muted">{item.label}</dt>
                    <dd className={clsx("min-w-0 break-words", item.mono && "font-mono")}>
                        {item.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
