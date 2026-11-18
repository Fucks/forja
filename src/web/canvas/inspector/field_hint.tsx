import type { JSX, ReactNode } from "react";

/** A short explanation or example under a field. */
export function FieldHint({ children }: { children: ReactNode }): JSX.Element {
    return <p className="text-xs text-muted">{children}</p>;
}
