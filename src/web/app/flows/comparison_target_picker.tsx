import type { JSX } from "react";

import { DRAFT_LABEL, versionLabel } from "@/web/app/flows/use_version_comparison.js";
import type { ComparisonTarget } from "@/web/app/flows/use_version_comparison.js";
import { Field } from "@/web/components/ui/field.js";
import { Select } from "@/web/components/ui/select.js";

const COMPARISON_TARGET_FIELD_ID = "comparison-target";

interface ComparisonOption {
    value: ComparisonTarget;
    label: string;
}

/** Without a previous version only the draft is offered. */
export function ComparisonTargetPicker({
    target,
    previousVersion,
    onChange,
}: {
    target: ComparisonTarget;
    previousVersion: number | undefined;
    onChange: (target: ComparisonTarget) => void;
}): JSX.Element {
    return (
        <div className="w-64">
            <Field label="Comparar com" htmlFor={COMPARISON_TARGET_FIELD_ID}>
                <Select
                    value={target}
                    onChange={onChange}
                    options={listComparisonOptions(previousVersion)}
                />
            </Field>
        </div>
    );
}

function listComparisonOptions(previousVersion: number | undefined): ComparisonOption[] {
    const draftOption: ComparisonOption = { value: "draft", label: DRAFT_LABEL };
    if (previousVersion === undefined) {
        return [draftOption];
    }

    return [
        { value: "previous", label: `Versão anterior (${versionLabel(previousVersion)})` },
        draftOption,
    ];
}
