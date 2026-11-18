import type { JSX } from "react";

import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowGraph, NodeOfType } from "@/shared/flow_graph.js";
import {
    MIN_SCRIPT_TIMEOUT_MINUTES,
    SCRIPT_FAILURE_POLICIES,
    SCRIPT_OUTPUT_MODES,
    SCRIPT_RUN_LOCATIONS,
    SCRIPT_SHELLS,
    scriptConfigSchema,
} from "@/shared/node_configs/script_config.js";
import type { ScriptConfig, ScriptRunLocation } from "@/shared/node_configs/script_config.js";
import { AdvancedSection } from "@/web/canvas/inspector/advanced_section.js";
import { EnvListEditor } from "@/web/canvas/inspector/env_list_editor.js";
import { fieldDoc, fieldOptionCards } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields, InspectorSection } from "@/web/canvas/inspector/inspector_section.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { OptionCardsField } from "@/web/canvas/inspector/option_cards_field.js";
import { ScriptCommandField } from "@/web/canvas/inspector/script_command_field.js";
import { TextField, toOptionalText } from "@/web/canvas/inspector/text_field.js";
import { useAvailableData } from "@/web/canvas/inspector/use_available_data.js";

type ChangeScriptConfig = (changes: Partial<ScriptConfig>) => void;

interface ScriptSectionProps {
    config: ScriptConfig;
    onConfigChange: ChangeScriptConfig;
}

const RUN_LOCATION_DOC = fieldDoc("script", "runIn");
const RUN_LOCATION_CARDS = fieldOptionCards(RUN_LOCATION_DOC, SCRIPT_RUN_LOCATIONS);
const FAILURE_POLICY_DOC = fieldDoc("script", "onFailure");
const FAILURE_POLICY_CARDS = fieldOptionCards(FAILURE_POLICY_DOC, SCRIPT_FAILURE_POLICIES);
const OUTPUT_MODE_DOC = fieldDoc("script", "parseOutput");
const OUTPUT_MODE_CARDS = fieldOptionCards(OUTPUT_MODE_DOC, SCRIPT_OUTPUT_MODES);
const ENV_DOC = fieldDoc("script", "env");
const SHELL_DOC = fieldDoc("script", "shell");
const SHELL_CARDS = fieldOptionCards(SHELL_DOC, SCRIPT_SHELLS);

export function ScriptInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    // The registry routes only scripts here; the check narrows the node to its script config.
    if (!isNodeOfType(node, "script")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig: ChangeScriptConfig = (changes) =>
        onChange((current) => withNodeConfig(current, "script", changes));

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <ScriptCommandField script={node} graph={graph} onConfigChange={changeConfig} />
                <RunLocationField config={config} onConfigChange={changeConfig} />
                <FailurePolicyField config={config} onConfigChange={changeConfig} />
            </InspectorFields>
            <EnvSection script={node} graph={graph} onConfigChange={changeConfig} />
            <InspectorSection title={OUTPUT_MODE_DOC.label}>
                <OptionCardsField
                    doc={OUTPUT_MODE_DOC}
                    value={config.parseOutput}
                    options={OUTPUT_MODE_CARDS}
                    onChange={(parseOutput) => changeConfig({ parseOutput })}
                />
            </InspectorSection>
            <ScriptAdvancedSection script={node} onConfigChange={changeConfig} />
        </NodeInspectorFrame>
    );
}

function RunLocationField({ config, onConfigChange }: ScriptSectionProps): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <OptionCardsField
                doc={RUN_LOCATION_DOC}
                value={config.runIn}
                options={RUN_LOCATION_CARDS}
                onChange={(runIn) => onConfigChange(withRunLocation(runIn))}
            />
            {config.runIn === "item" && (
                <FieldNote>Precisa da entrada Item atual ligada.</FieldNote>
            )}
        </div>
    );
}

// Only an isolated container chooses its image, so the item container drops the hidden one.
function withRunLocation(runIn: ScriptRunLocation): Partial<ScriptConfig> {
    if (runIn === "item") {
        return { runIn, image: undefined };
    }

    return { runIn };
}

function FailurePolicyField({ config, onConfigChange }: ScriptSectionProps): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <OptionCardsField
                doc={FAILURE_POLICY_DOC}
                value={config.onFailure}
                options={FAILURE_POLICY_CARDS}
                onChange={(onFailure) => onConfigChange({ onFailure })}
            />
            {config.onFailure === "continue" && (
                <FieldNote>Ligue Resultado › passed a uma Decisão.</FieldNote>
            )}
        </div>
    );
}

function EnvSection({
    script,
    graph,
    onConfigChange,
}: {
    script: NodeOfType<"script">;
    graph: FlowGraph;
    onConfigChange: ChangeScriptConfig;
}): JSX.Element {
    const fields = useAvailableData(graph, script.id, { scope: "node" });

    return (
        <InspectorSection title={ENV_DOC.label}>
            <FieldHeading doc={ENV_DOC} />
            <EnvListEditor
                env={script.config.env}
                fields={fields}
                onChange={(env) => onConfigChange({ env })}
            />
        </InspectorSection>
    );
}

function ScriptAdvancedSection({
    script,
    onConfigChange,
}: {
    script: NodeOfType<"script">;
    onConfigChange: ChangeScriptConfig;
}): JSX.Element {
    const { config } = script;

    return (
        <AdvancedSection>
            <OptionCardsField
                doc={SHELL_DOC}
                value={config.shell}
                options={SHELL_CARDS}
                onChange={(shell) => onConfigChange({ shell })}
            />
            <TextField
                doc={fieldDoc("script", "workingDir")}
                text={config.workingDir ?? ""}
                placeholder="raiz do repositório"
                mono
                onChange={(workingDir) =>
                    onConfigChange({ workingDir: toOptionalText(workingDir) })
                }
            />
            {config.runIn === "isolated" && (
                <TextField
                    doc={fieldDoc("script", "image")}
                    text={config.image ?? ""}
                    placeholder="imagem do agente do projeto"
                    mono
                    onChange={(image) => onConfigChange({ image: toOptionalText(image) })}
                />
            )}
            <IntegerField
                doc={fieldDoc("script", "timeoutMinutes")}
                value={config.timeoutMinutes}
                schema={scriptConfigSchema.shape.timeoutMinutes}
                limits={{ min: MIN_SCRIPT_TIMEOUT_MINUTES }}
                onChange={(timeoutMinutes) => onConfigChange({ timeoutMinutes })}
            />
        </AdvancedSection>
    );
}

function FieldNote({ children }: { children: string }): JSX.Element {
    return <p className="text-xs text-muted">{children}</p>;
}
