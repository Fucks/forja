import { useMemo } from "react";
import type { JSX } from "react";

import { availableVariables } from "@/engine/prompt_template.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowGraph, NodeOfType } from "@/shared/flow_graph.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import { useInheritedSettings } from "@/web/canvas/inspector/inherited_settings.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorSection } from "@/web/canvas/inspector/inspector_section.js";
import { LabelField } from "@/web/canvas/inspector/label_field.js";
import { ExecutionFields } from "@/web/canvas/inspector/execution_fields.js";
import { EffortField, ModelField } from "@/web/canvas/inspector/model_effort_fields.js";
import {
    withInputPort,
    withNodeConfig,
    withoutInputPort,
} from "@/web/canvas/inspector/node_updates.js";
import { OutputSchemaEditor } from "@/web/canvas/inspector/output_schema_editor.js";
import { PortListEditor } from "@/web/canvas/inspector/port_list_editor.js";
import { PromptEditor } from "@/web/canvas/inspector/prompt_editor.js";
import {
    CredentialField,
    ToolProfileField,
} from "@/web/canvas/inspector/tools_credential_fields.js";

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
        <div className="flex flex-col">
            <LabelField
                label={node.label}
                onChange={(label) => onChange((current) => ({ ...current, label }))}
            />
            <PromptSection agent={node} graph={graph} onConfigChange={changeConfig} />
            <ModelAndEffortSection agent={node} onConfigChange={changeConfig} />
            <ToolsAndCredentialSection agent={node} onConfigChange={changeConfig} />
            <InspectorSection title="Execução">
                <ExecutionFields config={node.config} onChange={changeConfig} />
            </InspectorSection>
            <InspectorSection title="Saída">
                <OutputSchemaEditor
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
        </div>
    );
}

function PromptSection({
    agent,
    graph,
    onConfigChange,
}: AgentSectionProps & { graph: FlowGraph }): JSX.Element {
    const variables = useMemo(() => availableVariables(agent, graph), [agent, graph]);

    return (
        <InspectorSection title="Prompt" isInitiallyOpen>
            <PromptEditor
                prompt={agent.config.prompt}
                variables={variables}
                onChange={(prompt) => onConfigChange({ prompt })}
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

function ToolsAndCredentialSection({ agent, onConfigChange }: AgentSectionProps): JSX.Element {
    const inheritedSettings = useInheritedSettings();

    return (
        <InspectorSection title="Ferramentas e credencial">
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
        </InspectorSection>
    );
}
