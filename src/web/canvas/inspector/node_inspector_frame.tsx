import type { JSX, ReactNode } from "react";

import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorSection } from "@/web/canvas/inspector/inspector_section.js";
import { LabelField } from "@/web/canvas/inspector/label_field.js";

// The layout of the inspectors whose settings fit in one section: the label, then the settings.
export function NodeInspectorFrame({
    node,
    onChange,
    title,
    children,
}: Pick<InspectorProps, "node" | "onChange"> & {
    title: string;
    children: ReactNode;
}): JSX.Element {
    return (
        <div className="flex flex-col">
            <LabelField
                label={node.label}
                onChange={(label) => onChange((current) => ({ ...current, label }))}
            />
            <InspectorSection title={title} isInitiallyOpen>
                {children}
            </InspectorSection>
        </div>
    );
}
