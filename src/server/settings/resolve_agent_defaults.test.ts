import { resolveAgentDefaults } from "@/server/settings/resolve_agent_defaults.js";
import { projectSettingsSchema } from "@/shared/settings_types.js";

const PROJECT_SETTINGS = projectSettingsSchema.parse({
    defaultCredentialId: "cred_projeto",
    defaultModel: "claude-sonnet-5-5",
    defaultEffort: "medium",
    defaultToolProfileId: "tlp_projeto",
    systemPrompt: "Responda em português.",
    agentImage: "forja-agent:projeto",
});

describe("resolveAgentDefaults", () => {
    it("uses every project value when the node defines nothing", () => {
        const defaults = resolveAgentDefaults(PROJECT_SETTINGS, {});

        expect(defaults).toEqual({
            credentialId: "cred_projeto",
            model: "claude-sonnet-5-5",
            effort: "medium",
            toolProfileId: "tlp_projeto",
            systemPrompt: "Responda em português.",
            image: "forja-agent:projeto",
        });
    });

    it("uses every node value when the node defines all of them", () => {
        const defaults = resolveAgentDefaults(PROJECT_SETTINGS, {
            credentialId: "cred_no",
            model: "claude-haiku-5-5",
            effort: "max",
            toolProfileId: "tlp_no",
        });

        expect(defaults).toMatchObject({
            credentialId: "cred_no",
            model: "claude-haiku-5-5",
            effort: "max",
            toolProfileId: "tlp_no",
        });
    });

    it("mixes the node values with the project values the node leaves out", () => {
        const defaults = resolveAgentDefaults(PROJECT_SETTINGS, { effort: "low" });

        expect(defaults).toMatchObject({
            credentialId: "cred_projeto",
            model: "claude-sonnet-5-5",
            effort: "low",
            toolProfileId: "tlp_projeto",
        });
    });

    it("uses the node credential when the project has none", () => {
        const project = projectSettingsSchema.parse({});

        const defaults = resolveAgentDefaults(project, { credentialId: "cred_no" });

        expect(defaults.credentialId).toBe("cred_no");
    });

    it("leaves the credential empty when neither the node nor the project defines one", () => {
        const project = projectSettingsSchema.parse({});

        const defaults = resolveAgentDefaults(project, {});

        expect(defaults.credentialId).toBeNull();
    });

    it("always takes the system prompt and the image from the project", () => {
        const defaults = resolveAgentDefaults(PROJECT_SETTINGS, { model: "claude-haiku-5-5" });

        expect(defaults).toMatchObject({
            systemPrompt: "Responda em português.",
            image: "forja-agent:projeto",
        });
    });
});
