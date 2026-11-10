import type { JSX, ReactNode } from "react";

export function InspectorSection({
    title,
    isInitiallyOpen = false,
    children,
}: {
    title: string;
    isInitiallyOpen?: boolean;
    children: ReactNode;
}): JSX.Element {
    return (
        <details open={isInitiallyOpen} className="border-t border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">
                {title}
            </summary>
            <div className="flex flex-col gap-3 px-3 pb-3">{children}</div>
        </details>
    );
}
