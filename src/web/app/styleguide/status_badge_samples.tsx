import type { JSX } from "react";

import { SampleRow, StyleguideSection } from "@/web/app/styleguide/styleguide_section.js";
import { EXECUTION_STATUSES } from "@/web/components/ui/execution_status.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";

export function StatusBadgeSamples(): JSX.Element {
    return (
        <StyleguideSection title="StatusBadge">
            <SampleRow label="Médio">
                {EXECUTION_STATUSES.map((status) => (
                    <StatusBadge key={status} status={status} />
                ))}
            </SampleRow>
            <SampleRow label="Pequeno">
                {EXECUTION_STATUSES.map((status) => (
                    <StatusBadge key={status} status={status} size="sm" />
                ))}
            </SampleRow>
            <SampleRow label="Só ícone">
                {EXECUTION_STATUSES.map((status) => (
                    <StatusBadge key={status} status={status} size="sm" showLabel={false} />
                ))}
            </SampleRow>
        </StyleguideSection>
    );
}
