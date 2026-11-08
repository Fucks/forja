import {
    buildGlobalSettings,
    buildProjectSettings,
    toGlobalSettingsDraft,
    toProjectSettingsDraft,
} from "@/web/app/projects/settings_draft.js";
import {
    DEFAULT_GLOBAL_SETTINGS,
    DEFAULT_PROJECT_SETTINGS,
    projectSettingsSchema,
} from "@/shared/settings_types.js";

describe("settings drafts", () => {
    it("shows the fields that keep their default as blank", () => {
        const draft = toProjectSettingsDraft(DEFAULT_PROJECT_SETTINGS);

        expect(draft).toMatchObject({
            defaultModel: "",
            agentImage: "",
            maxConcurrentAgents: "",
            dailyBudgetUsd: "",
            timezone: "",
        });
    });

    it("shows the fields that differ from the default as text", () => {
        const settings = projectSettingsSchema.parse({
            maxConcurrentAgents: 5,
            dailyBudgetUsd: 2.5,
        });

        const draft = toProjectSettingsDraft(settings);

        expect(draft).toMatchObject({ maxConcurrentAgents: "5", dailyBudgetUsd: "2.5" });
    });

    it("saves blank fields as the defaults", () => {
        const draft = toProjectSettingsDraft(DEFAULT_PROJECT_SETTINGS);

        expect(buildProjectSettings({ ...draft, defaultModel: "  " })).toEqual(
            DEFAULT_PROJECT_SETTINGS,
        );
    });

    it("reads the typed project values back", () => {
        const draft = toProjectSettingsDraft(DEFAULT_PROJECT_SETTINGS);

        const settings = buildProjectSettings({
            ...draft,
            defaultModel: " claude-sonnet-5-5 ",
            maxConcurrentAgents: "6",
            dailyBudgetUsd: "10",
        });

        expect(settings).toMatchObject({
            defaultModel: "claude-sonnet-5-5",
            maxConcurrentAgents: 6,
            dailyBudgetUsd: 10,
        });
    });

    it("round-trips the global settings", () => {
        const draft = toGlobalSettingsDraft(DEFAULT_GLOBAL_SETTINGS);

        const settings = buildGlobalSettings({ ...draft, logRetentionDays: "7" });

        expect(draft.logRetentionDays).toBe("");
        expect(settings).toEqual({ ...DEFAULT_GLOBAL_SETTINGS, logRetentionDays: 7 });
    });
});
