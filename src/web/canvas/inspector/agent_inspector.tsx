import { useMemo, useRef } from "react";
import type { JSX } from "react";

import { availableVariables } from "@/engine/prompt_template.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowGraph, NodeOfType } from "@/shared/flow_graph.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import { AdvancedSection } from "@/web/canvas/inspector/advanced_section.js";
import { ExecutionFields, ExecutionLimitFields } from "@/web/canvas/inspector/execution_fields.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import { useInheritedSettings } from "@/web/canvas/inspector/inherited_settings.js";
import { InsertDataButton } from "@/web/canvas/inspector/insert_data_button.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorSection } from "@/web/canvas/inspector/inspector_section.js";
import { EffortField, ModelField } from "@/web/canvas/inspector/model_effort_fields.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import {
    withInputPort,
    withNodeConfig,
    withoutInputPort,
} from "@/web/canvas/inspector/node_updates.js";
import { PortListEditor } from "@/web/canvas/inspector/port_list_editor.js";
import { PromptEditor } from "@/web/canvas/inspector/prompt_editor.js";
import type { PromptEditorHandle } from "@/web/canvas/inspector/prompt_editor.js";
import { ResponseFormatEditor } from "@/web/canvas/inspector/response_format_editor.js";
import {
    CredentialField,
    ToolProfileField,
} from "@/web/canvas/inspector/tools_credential_fields.js";
import { SwitchField } from "@/web/canvas/inspector/switch_field.js";
import { useAvailableData } from "@/web/canvas/inspector/use_available_data.js";

type AgentNode = NodeOfType<"agent">;
type ChangeAgentConfig = (changes: Partial<AgentConfig>) => void;

interface AgentSectionProps {
    agent: AgentNode;
    onConfigChange: ChangeAgentConfig;
}

export function AgentInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    // The registry routes only agents here; the check narrows the node to its agent config.
    if (!isNodeOfType(node, "agent")) {
        return <></>;
    }

    const changeConfig: ChangeAgentConfig = (changes) =>
        onChange((current) => withNodeConfig(current, "agent", changes));

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <PromptSection agent={node} graph={graph} onConfigChange={changeConfig} />
            <ModelAndEffortSection agent={node} onConfigChange={changeConfig} />
            <InspectorSection title="Execução">
                <ExecutionFields config={node.config} onChange={changeConfig} />
            </InspectorSection>
            <InspectorSection title="Formato da resposta">
                <FieldHeading doc={fieldDoc("agent", "outputSchema")} />
                <ResponseFormatEditor
                    outputSchema={node.config.outputSchema}
                    onChange={(outputSchema) => changeConfig({ outputSchema })}
                />
            </InspectorSection>
            <InspectorSection title="Portas">
                <PortListEditor
                    ports={node.inputs}
                    onAdd={(port) => onChange((current) => withInputPort(current, port))}
                    onRemove={(name) => onChange((current) => withoutInputPort(current, name))}
                />
            </InspectorSection>
            <AgentAdvancedSection agent={node} onConfigChange={changeConfig} />
        </NodeInspectorFrame>
    );
}

function PromptSection({
    agent,
    graph,
    onConfigChange,
}: AgentSectionProps & { graph: FlowGraph }): JSX.Element {
    const promptEditorRef = useRef<PromptEditorHandle>(null);
    const variables = useMemo(() => availableVariables(agent, graph), [agent, graph]);
    const fields = useAvailableData(graph, agent.id, { scope: "node" });

    return (
        <InspectorSection title="Prompt" isInitiallyOpen>
            <FieldHeading doc={fieldDoc("agent", "prompt")} />
            <PromptEditor
                ref={promptEditorRef}
                prompt={agent.config.prompt}
                variables={variables}
                onChange={(prompt) => onConfigChange({ prompt })}
                toolbarActions={
                    <InsertDataButton
                        fields={fields}
                        onInsert={(variable) => promptEditorRef.current?.insertAtCursor(variable)}
                    />
                }
            />
        </InspectorSection>
    );
}

function ModelAndEffortSection({ agent, onConfigChange }: AgentSectionProps): JSX.Element {
    const inheritedSettings = useInheritedSettings();

    return (
        <InspectorSection title="Modelo e esforço">
            <ModelField
                model={agent.config.model}
                inheritedModel={inheritedSettings?.defaultModel}
                onChange={(model) => onConfigChange({ model })}
            />
            <EffortField
                effort={agent.config.effort}
                inheritedEffort={inheritedSettings?.defaultEffort}
                onChange={(effort) => onConfigChange({ effort })}
            />
        </InspectorSection>
    );
}

function AgentAdvancedSection({ agent, onConfigChange }: AgentSectionProps): JSX.Element {
    const inheritedSettings = useInheritedSettings();

    return (
        <AdvancedSection>
            <ExecutionLimitFields config={agent.config} onChange={onConfigChange} />
            <ToolProfileField
                toolProfileId={agent.config.toolProfileId}
                inheritedToolProfileId={inheritedSettings?.defaultToolProfileId}
                onChange={(toolProfileId) => onConfigChange({ toolProfileId })}
            />
            <CredentialField
                credentialId={agent.config.credentialId}
                inheritedCredentialId={inheritedSettings?.defaultCredentialId}
                onChange={(credentialId) => onConfigChange({ credentialId })}
            />
            <SwitchField
                doc={fieldDoc("agent", "expandPromptCommands")}
                checked={agent.config.expandPromptCommands}
                onChange={(expandPromptCommands) => onConfigChange({ expandPromptCommands })}
            />
        </AdvancedSection>
    );
}
