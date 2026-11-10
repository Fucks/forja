import { useId, useState } from "react";
import type { JSX } from "react";

import { EFFORTS } from "@/shared/agent_types.js";
import type { Effort } from "@/shared/agent_types.js";
import { describeDefault } from "@/web/app/projects/settings_section.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { SegmentedControl } from "@/web/components/ui/segmented_control.js";
import { Select } from "@/web/components/ui/select.js";

const SUGGESTED_MODELS = [
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-haiku-5-5",
    "claude-fable-5-1",
];
const PROJECT_MODEL_OPTION = "project-model";
const OTHER_MODEL_OPTION = "other-model";
const MODEL_OPTIONS = [
    { value: PROJECT_MODEL_OPTION, label: "padrão do projeto" },
    ...SUGGESTED_MODELS.map((model) => ({ value: model, label: model })),
    { value: OTHER_MODEL_OPTION, label: "Outro modelo…" },
];

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
    const selectId = useId();
    const otherModelId = useId();
    const [isOtherModel, setIsOtherModel] = useState(() => isOutsideSuggestions(model));

    function selectModelOption(option: string): void {
        setIsOtherModel(option === OTHER_MODEL_OPTION);
        if (option === OTHER_MODEL_OPTION) {
            return;
        }

        onChange(option === PROJECT_MODEL_OPTION ? undefined : option);
    }

    return (
        <>
            <Field label="Modelo" htmlFor={selectId} hint={describeInherited(inheritedModel)}>
                <Select
                    value={chooseModelOption(model, isOtherModel)}
                    options={MODEL_OPTIONS}
                    onChange={selectModelOption}
                />
            </Field>
            {isOtherModel && (
                <Field label="Nome do modelo" htmlFor={otherModelId}>
                    <Input
                        mono
                        defaultValue={model ?? ""}
                        onBlur={(event) => onChange(event.target.value.trim() || undefined)}
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
            <span className="text-sm font-medium text-text">Effort</span>
            <SegmentedControl
                label="Effort"
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

function chooseModelOption(model: string | undefined, isOtherModel: boolean): string {
    if (isOtherModel) {
        return OTHER_MODEL_OPTION;
    }

    return model ?? PROJECT_MODEL_OPTION;
}

export function describeInherited(inheritedValue: string | undefined): string | undefined {
    return inheritedValue === undefined ? undefined : describeDefault(inheritedValue);
}
