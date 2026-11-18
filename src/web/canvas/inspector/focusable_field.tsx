import type { JSX, ReactNode } from "react";

import { useFocusField } from "@/web/canvas/inspector/use_focus_field.js";

/** The controls of a field that a problem can point to: a request for `fieldKey` focuses them. */
export function FocusableField({
    fieldKey,
    children,
}: {
    fieldKey: string;
    children: ReactNode;
}): JSX.Element {
    const fieldRef = useFocusField<HTMLDivElement>(fieldKey);

    // `contents` keeps the parent's layout, as if the controls were not wrapped.
    return (
        <div ref={fieldRef} className="contents">
            {children}
        </div>
    );
}
