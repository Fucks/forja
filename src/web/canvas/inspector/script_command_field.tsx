import { useMemo, useRef } from "react";
import type { JSX } from "react";

import { availableVariables } from "@/engine/prompt_template.js";
import type { FlowGraph, NodeOfType } from "@/shared/flow_graph.js";
import type { ScriptConfig } from "@/shared/node_configs/script_config.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import { InsertDataButton } from "@/web/canvas/inspector/insert_data_button.js";
import { PromptEditor } from "@/web/canvas/inspector/prompt_editor.js";
import type { PromptEditorHandle } from "@/web/canvas/inspector/prompt_editor.js";
import { ScriptPresetChips } from "@/web/canvas/inspector/script_preset_chips.js";
import type { ScriptPreset } from "@/web/canvas/inspector/script_presets.js";
import { useAvailableData } from "@/web/canvas/inspector/use_available_data.js";
import { nodeDocPath } from "@/web/config/navigation.js";

export function ScriptCommandField({
    script,
    graph,
    onConfigChange,
}: {
    script: NodeOfType<"script">;
    graph: FlowGraph;
    onConfigChange: (changes: Partial<ScriptConfig>) => void;
}): JSX.Element {
    const commandEditorRef = useRef<PromptEditorHandle>(null);
    const variables = useMemo(() => availableVariables(script, graph), [script, graph]);
    const fields = useAvailableData(graph, script.id, { scope: "node" });

    // The editor keeps its own text, so the preset command is also written into it.
    function applyPreset({ config }: ScriptPreset): void {
        onConfigChange(config);
        if (config.command !== undefined) {
            commandEditorRef.current?.replaceAll(config.command);
        }
    }

    return (
        <div className="flex flex-col gap-1">
            <FieldHeading doc={fieldDoc("script", "command")} />
            <ScriptPresetChips currentCommand={script.config.command} onApply={applyPreset} />
            <PromptEditor
                ref={commandEditorRef}
                language="shell"
                prompt={script.config.command}
                variables={variables}
                onChange={(command) => onConfigChange({ command })}
                toolbarActions={
                    <InsertDataButton
                        fields={fields}
                        onInsert={(variable) => commandEditorRef.current?.insertAtCursor(variable)}
                    />
                }
            />
            <QuotedValuesNotice />
        </div>
    );
}

// Long texts break the command line, while an env var reaches the command untouched.
function QuotedValuesNotice(): JSX.Element {
    return (
        <p className="text-xs text-muted">
            Valores inseridos com {"{{…}}"} entram entre aspas. Para textos longos, prefira as
            variáveis FORJA_* (ex.: <code className="font-mono">$FORJA_ITEM_TITLE</code>).{" "}
            <a
                href={nodeDocPath("script")}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
            >
                Ver todas as variáveis FORJA_*
            </a>
        </p>
    );
}
