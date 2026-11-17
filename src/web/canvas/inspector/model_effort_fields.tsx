import { useId, useState } from "react";
import type { JSX } from "react";

import { EFFORTS } from "@/shared/agent_types.js";
import type { Effort } from "@/shared/agent_types.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import { InheritableSelect, describeInherited } from "@/web/canvas/inspector/inheritable_select.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { SegmentedControl } from "@/web/components/ui/segmented_control.js";

const SUGGESTED_MODELS = [
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-haiku-5-5",
    "claude-fable-5-1",
];
const OTHER_MODEL_OPTION = { value: "other-model", label: "Outro modelo…" };
const MODEL_OPTIONS = [
    ...SUGGESTED_MODELS.map((model) => ({ value: model, label: model })),
    OTHER_MODEL_OPTION,
];

const EFFORT_DOC = fieldDoc("agent", "effort");

const PROJECT_EFFORT_OPTION = "project-effort";
type EffortOption = Effort | typeof PROJECT_EFFORT_OPTION;
const EFFORT_OPTIONS: { value: EffortOption; label: string }[] = [
    { value: PROJECT_EFFORT_OPTION, label: "padrão" },
    ...EFFORTS.map((effort) => ({ value: effort, label: effort })),
];

export function ModelField({
    model,
    inheritedModel,
    onChange,
}: {
    model: string | undefined;
    inheritedModel: string | undefined;
    onChange: (model: string | undefined) => void;
}): JSX.Element {
    const otherModelId = useId();
    const [isOtherModel, setIsOtherModel] = useState(() => isOutsideSuggestions(model));

    function selectModel(selected: string | undefined): void {
        setIsOtherModel(selected === OTHER_MODEL_OPTION.value);
        if (selected !== OTHER_MODEL_OPTION.value) {
            onChange(selected);
        }
    }

    function applyTypedModel(typedModel: string): void {
        const otherModel = typedModel.trim() || undefined;
        if (otherModel !== model) {
            onChange(otherModel);
        }
    }

    return (
        <>
            <InheritableSelect
                doc={fieldDoc("agent", "model")}
                selected={isOtherModel ? OTHER_MODEL_OPTION.value : model}
                options={MODEL_OPTIONS}
                inheritedLabel={inheritedModel}
                onChange={selectModel}
            />
            {isOtherModel && (
                <Field label="Nome do modelo" htmlFor={otherModelId}>
                    <Input
                        mono
                        defaultValue={model ?? ""}
                        onBlur={(event) => applyTypedModel(event.target.value)}
                    />
                </Field>
            )}
        </>
    );
}

export function EffortField({
    effort,
    inheritedEffort,
    onChange,
}: {
    effort: Effort | undefined;
    inheritedEffort: Effort | undefined;
    onChange: (effort: Effort | undefined) => void;
}): JSX.Element {
    const hint = describeInherited(inheritedEffort);

    return (
        <div className="flex flex-col gap-1">
            <FieldHeading doc={EFFORT_DOC} />
            <SegmentedControl
                label={EFFORT_DOC.label}
                value={effort ?? PROJECT_EFFORT_OPTION}
                options={EFFORT_OPTIONS}
                onChange={(option) =>
                    onChange(option === PROJECT_EFFORT_OPTION ? undefined : option)
                }
            />
            {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
    );
}

function isOutsideSuggestions(model: string | undefined): boolean {
    return model !== undefined && !SUGGESTED_MODELS.includes(model);
}
