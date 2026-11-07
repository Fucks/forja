import { clsx } from "clsx";
import type { JSX } from "react";

export function Skeleton({ className }: { className?: string }): JSX.Element {
    return (
        <div
            aria-hidden="true"
            className={clsx("rounded-sm bg-border motion-safe:animate-pulse", className)}
        />
    );
}
