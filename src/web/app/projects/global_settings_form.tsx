import type { JSX } from "react";

import { DEFAULT_GLOBAL_SETTINGS } from "@/shared/settings_types.js";
import type { GlobalSettingsDraft } from "@/web/app/projects/settings_draft.js";
import { SettingField, SettingsSection } from "@/web/app/projects/settings_section.js";

type GlobalNumberField = Exclude<keyof GlobalSettingsDraft, "modelPrices">;

const GLOBAL_FIELD_LABELS: Record<GlobalNumberField, string> = {
    maxConcurrentAgents: "Agentes em paralelo",
    minStartIntervalMs: "Intervalo mínimo entre inícios (ms)",
    usageLimitMarginMinutes: "Margem após o limite de uso (min)",
    logRetentionDays: "Retenção de logs (dias)",
    logMaxTotalMb: "Tamanho máximo dos logs (MB)",
};

const GLOBAL_NUMBER_FIELDS: GlobalNumberField[] = [
    "maxConcurrentAgents",
    "minStartIntervalMs",
    "usageLimitMarginMinutes",
    "logRetentionDays",
    "logMaxTotalMb",
];

export function GlobalSettingsForm({
    draft,
    onChange,
}: {
    draft: GlobalSettingsDraft;
    onChange: (draft: GlobalSettingsDraft) => void;
}): JSX.Element {
    return (
        <SettingsSection title="Toda a Forja" description="Valem para todos os projetos.">
            {GLOBAL_NUMBER_FIELDS.map((field) => (
                <SettingField
                    key={field}
                    label={GLOBAL_FIELD_LABELS[field]}
                    inputType="number"
                    fieldText={draft[field]}
                    defaultLabel={DEFAULT_GLOBAL_SETTINGS[field]}
                    onChange={(fieldText) => onChange({ ...draft, [field]: fieldText })}
                />
            ))}
        </SettingsSection>
    );
}
