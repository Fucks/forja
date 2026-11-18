import type { JSX } from "react";

import { assertNever } from "@/lib/assert_never.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { ConditionConfig } from "@/shared/node_configs/condition_config.js";
import { withDecisionConfig } from "@/web/canvas/inspector/condition_branch_edits.js";
import { ConditionBranchesEditor } from "@/web/canvas/inspector/condition_branches_editor.js";
import { ConditionEditor } from "@/web/canvas/inspector/condition_editor.js";
import { ConditionPreview } from "@/web/canvas/inspector/condition_preview.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import { DecisionModeSwitch } from "@/web/canvas/inspector/decision_mode_switch.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { useAvailableData } from "@/web/canvas/inspector/use_available_data.js";

interface DecisionFieldsProps {
    config: ConditionConfig;
    decisionId: string;
    fields: PickableDataField[];
    onChange: (config: ConditionConfig) => void;
}

export function ConditionInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    const fields = useAvailableData(graph, node.id, { scope: "node" });
    // The registry routes only conditions here; the check narrows the node to its condition config.
    if (!isNodeOfType(node, "condition")) {
        return <></>;
    }

    const changeConfig = (config: ConditionConfig): void =>
        onChange((current) => withDecisionConfig(current, config));

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <FieldHeading doc={fieldDoc("condition", "mode")} />
                <DecisionModeSwitch config={node.config} onChange={changeConfig} />
                <DecisionFields
                    config={node.config}
                    decisionId={node.id}
                    fields={fields}
                    onChange={changeConfig}
                />
            </InspectorFields>
        </NodeInspectorFrame>
    );
}

function DecisionFields({
    config,
    decisionId,
    fields,
    onChange,
}: DecisionFieldsProps): JSX.Element {
    switch (config.mode) {
        case "if":
            return (
                <>
                    <FieldHeading doc={fieldDoc("condition", "condition")} />
                    <ConditionEditor
                        value={config.condition}
                        fields={fields}
                        onChange={(condition) => onChange({ ...config, condition })}
                    />
                    <ConditionPreview condition={config.condition} decisionId={decisionId} />
                </>
            );
        case "switch":
            return (
                <>
                    <FieldHeading doc={fieldDoc("condition", "branches")} />
                    <ConditionBranchesEditor config={config} fields={fields} onChange={onChange} />
                </>
            );
        default:
            return assertNever(config);
    }
}
