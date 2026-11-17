import type { JSX, ReactNode } from "react";

import { InspectorSection } from "@/web/canvas/inspector/inspector_section.js";

// The fields whose doc marks them as advanced: rarely changed, so they start folded.
export function AdvancedSection({ children }: { children: ReactNode }): JSX.Element {
    return <InspectorSection title="Avançado">{children}</InspectorSection>;
}
