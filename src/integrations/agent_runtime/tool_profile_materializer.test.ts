import path from "node:path";

import {
    credentialIdsReferencedBy,
    materializeToolProfile,
    UnknownCredentialError,
    workspaceSetupCommands,
    type ToolProfileMaterializationDeps,
} from "@/integrations/agent_runtime/tool_profile_materializer.js";
import {
    CODEGRAPH_PRESET_ID,
    DEFAULT_PRESET_ID,
    findPresetById,
    READONLY_PRESET_ID,
} from "@/server/tool_profiles/tool_profile_presets.js";
import type { ToolProfile } from "@/shared/tool_profile_types.js";

const RUNTIME_DIR = { host: "/home/ana/.forja/runtime/forja-abc", container: "/home/agent/.forja" };
const MCP_CONFIG_IN_CONTAINER = "/home/agent/.forja/mcp-dev.json";
const GITHUB_CREDENTIAL_ID = "cred_01J9ZK3M4N5P6Q7R8S9TGITHUB";
const GITHUB_TOKEN = "ghp_super-secret-token";

const DEPS: ToolProfileMaterializationDeps = {
    nodeId: "dev",
    runtimeDir: RUNTIME_DIR,
    credentialEnv: (id) =>
        id === GITHUB_CREDENTIAL_ID ? { envVar: "GH_TOKEN", value: GITHUB_TOKEN } : undefined,
    packageManager: null,
};

function preset(id: string): ToolProfile {
    const profile = findPresetById(id);
    if (!profile) {
        throw new Error(`Preset ${id} not found`);
    }

    return profile;
}

function profileWithGithubMcp(env: Record<string, string>): ToolProfile {
    return {
        ...preset(DEFAULT_PRESET_ID),
        mcpServers: [{ name: "github", command: "github-mcp", args: ["stdio"], env }],
    };
}

function mcpConfigOf(profile: ToolProfile, deps = DEPS): unknown {
    const content = materializeToolProfile(profile, deps).mcpConfigFile?.content ?? "";
    return JSON.parse(content);
}

describe("materializeToolProfile", () => {
    it("points the CodeGraph preset at an MCP file with only the codegraph server", () => {
        const materialization = materializeToolProfile(preset(CODEGRAPH_PRESET_ID), DEPS);

        expect(materialization.toolArgs).toEqual([
            "--mcp-config",
            MCP_CONFIG_IN_CONTAINER,
            "--strict-mcp-config",
            "--allowedTools",
            "mcp__codegraph__*",
        ]);
        expect(materialization.mcpConfigFile).toMatchObject({
            hostPath: path.join(RUNTIME_DIR.host, "mcp-dev.json"),
            containerPath: MCP_CONFIG_IN_CONTAINER,
        });
        expect(mcpConfigOf(preset(CODEGRAPH_PRESET_ID))).toEqual({
            mcpServers: { codegraph: { command: "codegraph", args: ["serve", "--mcp"], env: {} } },
        });
    });

    it("indexes the workspace with CodeGraph when the profile asks for it", () => {
        const materialization = materializeToolProfile(preset(CODEGRAPH_PRESET_ID), DEPS);

        expect(materialization.setupCommands.map(({ command }) => command)).toEqual([
            "codegraph init --yes",
        ]);
    });

    it("forbids writing and editing files with the read-only preset", () => {
        const materialization = materializeToolProfile(preset(READONLY_PRESET_ID), DEPS);

        expect(materialization.toolArgs).toEqual([
            "--mcp-config",
            MCP_CONFIG_IN_CONTAINER,
            "--strict-mcp-config",
            "--disallowedTools",
            "Write",
            "Edit",
            "NotebookEdit",
        ]);
    });

    it("gives a profile without MCPs an empty MCP file so none is inherited from the image", () => {
        const materialization = materializeToolProfile(preset(DEFAULT_PRESET_ID), DEPS);

        expect(materialization.toolArgs).toEqual([
            "--mcp-config",
            MCP_CONFIG_IN_CONTAINER,
            "--strict-mcp-config",
        ]);
        expect(mcpConfigOf(preset(DEFAULT_PRESET_ID))).toEqual({ mcpServers: {} });
        expect(materialization.setupCommands).toEqual([]);
        expect(materialization.env).toEqual({});
    });

    it("takes the permission mode of the profile", () => {
        const profile = { ...preset(DEFAULT_PRESET_ID), permissionMode: "plan" as const };

        expect(materializeToolProfile(profile, DEPS).permissionMode).toBe("plan");
    });

    it("installs the dependencies first when the repository has a package.json", () => {
        const deps = { ...DEPS, packageManager: "npm" as const };

        const materialization = materializeToolProfile(preset(CODEGRAPH_PRESET_ID), deps);

        expect(materialization.setupCommands.map(({ command }) => command)).toEqual([
            "npm i",
            "codegraph init --yes",
        ]);
    });

    it.each([
        ["pnpm", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install"],
        ["yarn", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack yarn install"],
        ["bun", "bun install"],
    ] as const)(
        "installs the dependencies with %s when the repository uses it",
        (manager, command) => {
            const deps = { ...DEPS, packageManager: manager };

            const materialization = materializeToolProfile(preset(DEFAULT_PRESET_ID), deps);

            expect(materialization.setupCommands.map((setup) => setup.command)).toEqual([command]);
        },
    );

    it("keeps the credential out of the MCP file and passes its value through the env", () => {
        const profile = profileWithGithubMcp({
            GITHUB_PERSONAL_ACCESS_TOKEN: `\${cred:${GITHUB_CREDENTIAL_ID}}`,
            AUTHORIZATION: `Bearer \${cred:${GITHUB_CREDENTIAL_ID}}`,
            GITHUB_HOST: "github.com",
        });

        const materialization = materializeToolProfile(profile, DEPS);

        expect(materialization.mcpConfigFile?.content).not.toContain(GITHUB_TOKEN);
        expect(materialization.env).toEqual({ GH_TOKEN: GITHUB_TOKEN });
        expect(mcpConfigOf(profile)).toEqual({
            mcpServers: {
                github: {
                    command: "github-mcp",
                    args: ["stdio"],
                    env: {
                        GITHUB_PERSONAL_ACCESS_TOKEN: "${GH_TOKEN}",
                        AUTHORIZATION: "Bearer ${GH_TOKEN}",
                        GITHUB_HOST: "github.com",
                    },
                },
            },
        });
    });

    it("rejects a profile that references a credential that does not exist", () => {
        const profile = profileWithGithubMcp({ TOKEN: "${cred:cred_01J9ZK3M4N5P6Q7R8S9TMISSIN}" });

        expect(() => materializeToolProfile(profile, DEPS)).toThrow(UnknownCredentialError);
    });

    it("gives each node its own MCP file", () => {
        const reviewerDeps = { ...DEPS, nodeId: "reviewer" };

        const materialization = materializeToolProfile(preset(READONLY_PRESET_ID), reviewerDeps);

        expect(materialization.mcpConfigFile?.containerPath).toBe(
            "/home/agent/.forja/mcp-reviewer.json",
        );
    });
});

describe("credentialIdsReferencedBy", () => {
    it("lists each credential referenced by the MCP env once", () => {
        const profile = profileWithGithubMcp({
            TOKEN: `\${cred:${GITHUB_CREDENTIAL_ID}}`,
            AUTHORIZATION: `Bearer \${cred:${GITHUB_CREDENTIAL_ID}}`,
        });

        expect(credentialIdsReferencedBy(profile)).toEqual([GITHUB_CREDENTIAL_ID]);
    });
});

describe("workspaceSetupCommands", () => {
    it("runs each setup command once for all the profiles of the item", () => {
        const profiles = [
            preset(CODEGRAPH_PRESET_ID),
            preset(READONLY_PRESET_ID),
            preset(CODEGRAPH_PRESET_ID),
        ];

        const commands = workspaceSetupCommands(profiles, { packageManager: "npm" });

        expect(commands.map(({ command }) => command)).toEqual(["npm i", "codegraph init --yes"]);
    });
});
