import type { Effort } from "@/shared/agent_types.js";
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import type { GlobalSettings, ProjectSettings } from "@/shared/settings_types.js";

// Typed fields are kept as text while editing. A blank field means "use the default", so the
// inherited value can be shown as the field's placeholder.
export interface ProjectSettingsDraft {
    defaultCredentialId: string | null;
    githubCredentialId: string | null;
    defaultModel: string;
    defaultEffort: Effort;
    defaultToolProfileId: string;
    systemPrompt: string;
    agentImage: string;
    maxConcurrentAgents: string;
    dailyBudgetUsd: string;
    timezone: string;
}

export interface GlobalSettingsDraft {
    maxConcurrentAgents: string;
    minStartIntervalMs: string;
    usageLimitMarginMinutes: string;
    logRetentionDays: string;
    logMaxTotalMb: string;
    modelPrices: GlobalSettings["modelPrices"];
}

const BLANK = "";

export function toProjectSettingsDraft(settings: ProjectSettings): ProjectSettingsDraft {
    const defaults = DEFAULT_PROJECT_SETTINGS;

    return {
        defaultCredentialId: settings.defaultCredentialId,
        githubCredentialId: settings.githubCredentialId,
        defaultModel: toFieldText(settings.defaultModel, defaults.defaultModel),
        defaultEffort: settings.defaultEffort,
        defaultToolProfileId: settings.defaultToolProfileId,
        systemPrompt: settings.systemPrompt,
        agentImage: toFieldText(settings.agentImage, defaults.agentImage),
        maxConcurrentAgents: toFieldText(
            settings.maxConcurrentAgents,
            defaults.maxConcurrentAgents,
        ),
        dailyBudgetUsd: toOptionalFieldText(settings.dailyBudgetUsd),
        timezone: toFieldText(settings.timezone, defaults.timezone),
    };
}

export function buildProjectSettings(draft: ProjectSettingsDraft): ProjectSettings {
    const defaults = DEFAULT_PROJECT_SETTINGS;

    return {
        ...draft,
        defaultModel: readText(draft.defaultModel, defaults.defaultModel),
        agentImage: readText(draft.agentImage, defaults.agentImage),
        maxConcurrentAgents: readNumber(draft.maxConcurrentAgents, defaults.maxConcurrentAgents),
        dailyBudgetUsd: readOptionalNumber(draft.dailyBudgetUsd),
        timezone: readText(draft.timezone, defaults.timezone),
    };
}

export function toGlobalSettingsDraft(settings: GlobalSettings): GlobalSettingsDraft {
    const defaults = DEFAULT_GLOBAL_SETTINGS;

    return {
        maxConcurrentAgents: toFieldText(
            settings.maxConcurrentAgents,
            defaults.maxConcurrentAgents,
        ),
        minStartIntervalMs: toFieldText(settings.minStartIntervalMs, defaults.minStartIntervalMs),
        usageLimitMarginMinutes: toFieldText(
            settings.usageLimitMarginMinutes,
            defaults.usageLimitMarginMinutes,
        ),
        logRetentionDays: toFieldText(settings.logRetentionDays, defaults.logRetentionDays),
        logMaxTotalMb: toFieldText(settings.logMaxTotalMb, defaults.logMaxTotalMb),
        modelPrices: settings.modelPrices,
    };
}

export function buildGlobalSettings(draft: GlobalSettingsDraft): GlobalSettings {
    const defaults = DEFAULT_GLOBAL_SETTINGS;

    return {
        maxConcurrentAgents: readNumber(draft.maxConcurrentAgents, defaults.maxConcurrentAgents),
        minStartIntervalMs: readNumber(draft.minStartIntervalMs, defaults.minStartIntervalMs),
        usageLimitMarginMinutes: readNumber(
            draft.usageLimitMarginMinutes,
            defaults.usageLimitMarginMinutes,
        ),
        logRetentionDays: readNumber(draft.logRetentionDays, defaults.logRetentionDays),
        logMaxTotalMb: readNumber(draft.logMaxTotalMb, defaults.logMaxTotalMb),
        modelPrices: draft.modelPrices,
    };
}

function toFieldText(savedValue: string | number, defaultValue: string | number): string {
    return savedValue === defaultValue ? BLANK : String(savedValue);
}

function toOptionalFieldText(savedValue: number | null): string {
    return savedValue === null ? BLANK : String(savedValue);
}

function readText(fieldText: string, defaultValue: string): string {
    const trimmed = fieldText.trim();
    return trimmed === BLANK ? defaultValue : trimmed;
}

function readNumber(fieldText: string, defaultValue: number): number {
    const trimmed = fieldText.trim();
    return trimmed === BLANK ? defaultValue : Number(trimmed);
}

function readOptionalNumber(fieldText: string): number | null {
    const trimmed = fieldText.trim();
    return trimmed === BLANK ? null : Number(trimmed);
}
