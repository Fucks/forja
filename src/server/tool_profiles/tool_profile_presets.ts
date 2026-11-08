import type { ToolProfile } from "@/shared/tool_profile_types.js";

export const CODEGRAPH_PRESET_ID = "tlp_builtin_codegraph";
export const READONLY_PRESET_ID = "tlp_builtin_readonly";
export const DEFAULT_PRESET_ID = "tlp_builtin_default";

// Presets ship with the code, so they carry a fixed timestamp instead of a creation time.
const PRESETS_RELEASED_AT = "2026-11-01T00:00:00.000Z";

export const TOOL_PROFILE_PRESETS: readonly ToolProfile[] = [
    {
        id: CODEGRAPH_PRESET_ID,
        name: "CodeGraph",
        description:
            "Busca por símbolo com o CodeGraph em vez de ler arquivos inteiros; indexa o repositório ao abrir o workspace.",
        mcpServers: [
            { name: "codegraph", command: "codegraph", args: ["serve", "--mcp"], env: {} },
        ],
        allowedTools: ["mcp__codegraph__*"],
        disallowedTools: [],
        permissionMode: "bypassPermissions",
        indexCodegraphOnStart: true,
        builtin: true,
        createdAt: PRESETS_RELEASED_AT,
        updatedAt: PRESETS_RELEASED_AT,
    },
    {
        id: READONLY_PRESET_ID,
        name: "Somente leitura",
        description:
            "Lê e executa comandos, mas não escreve nem edita arquivos. Ideal para revisores.",
        mcpServers: [],
        allowedTools: [],
        disallowedTools: ["Write", "Edit", "NotebookEdit"],
        permissionMode: "bypassPermissions",
        indexCodegraphOnStart: false,
        builtin: true,
        createdAt: PRESETS_RELEASED_AT,
        updatedAt: PRESETS_RELEASED_AT,
    },
    {
        id: DEFAULT_PRESET_ID,
        name: "Padrão",
        description: "Sem MCPs nem restrições: as ferramentas padrão do Claude Code.",
        mcpServers: [],
        allowedTools: [],
        disallowedTools: [],
        permissionMode: "bypassPermissions",
        indexCodegraphOnStart: false,
        builtin: true,
        createdAt: PRESETS_RELEASED_AT,
        updatedAt: PRESETS_RELEASED_AT,
    },
];

export function findPresetById(id: string): ToolProfile | undefined {
    return TOOL_PROFILE_PRESETS.find((preset) => preset.id === id);
}
