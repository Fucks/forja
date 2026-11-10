import { buildAgentEnv } from "@/integrations/agent_runtime/agent_env.js";

const API_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-a1b2";
const OAUTH_TOKEN = "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz-c3d4";
const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";

describe("buildAgentEnv", () => {
    it("passes an Anthropic API key as ANTHROPIC_API_KEY", () => {
        const env = buildAgentEnv({
            claude: { kind: "anthropic_api_key", value: API_KEY },
            extra: {},
        });

        expect(env).toEqual({ ANTHROPIC_API_KEY: API_KEY });
    });

    it("passes a Claude OAuth token as CLAUDE_CODE_OAUTH_TOKEN", () => {
        const env = buildAgentEnv({
            claude: { kind: "claude_oauth_token", value: OAUTH_TOKEN },
            extra: {},
        });

        expect(env).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN });
    });

    it("never sends ANTHROPIC_API_KEY next to an OAuth token, even from the extra env", () => {
        const env = buildAgentEnv({
            claude: { kind: "claude_oauth_token", value: OAUTH_TOKEN },
            extra: { ANTHROPIC_API_KEY: API_KEY },
        });

        expect(env).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN });
    });

    it("lets the Claude credential win over the same variable in the extra env", () => {
        const env = buildAgentEnv({
            claude: { kind: "anthropic_api_key", value: API_KEY },
            extra: {
                ANTHROPIC_API_KEY: "sk-ant-api03-outra",
                CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN,
            },
        });

        expect(env).toEqual({ ANTHROPIC_API_KEY: API_KEY });
    });

    it("passes the GitHub token as both GH_TOKEN and GITHUB_TOKEN", () => {
        const env = buildAgentEnv({ github: GITHUB_TOKEN, extra: {} });

        expect(env).toEqual({ GH_TOKEN: GITHUB_TOKEN, GITHUB_TOKEN: GITHUB_TOKEN });
    });

    it("keeps the extra env of the tool profile", () => {
        const env = buildAgentEnv({
            claude: { kind: "anthropic_api_key", value: API_KEY },
            github: GITHUB_TOKEN,
            extra: { SENTRY_TOKEN: "sentry-token-123" },
        });

        expect(env).toEqual({
            SENTRY_TOKEN: "sentry-token-123",
            ANTHROPIC_API_KEY: API_KEY,
            GH_TOKEN: GITHUB_TOKEN,
            GITHUB_TOKEN: GITHUB_TOKEN,
        });
    });
});
