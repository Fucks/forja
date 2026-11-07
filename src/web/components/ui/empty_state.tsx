import type { LucideIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";

const ICON_SIZE_PX = 32;

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
}): JSX.Element {
    return (
        <section className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Icon size={ICON_SIZE_PX} aria-hidden="true" className="text-muted" />
            <h2 className="font-condensed text-lg font-semibold">{title}</h2>
            {description && <p className="max-w-sm text-muted">{description}</p>}
            {action}
        </section>
    );
}
