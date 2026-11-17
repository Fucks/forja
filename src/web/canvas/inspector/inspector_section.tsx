import type { JSX, ReactNode } from "react";

const SECTION_CONTENT_CLASSES = "flex flex-col gap-3 px-3 pb-3";

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
            <div className={SECTION_CONTENT_CLASSES}>{children}</div>
        </details>
    );
}

// The main fields of an inspector, shown without a section title.
export function InspectorFields({ children }: { children: ReactNode }): JSX.Element {
    return <div className={SECTION_CONTENT_CLASSES}>{children}</div>;
}
