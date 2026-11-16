import type { JSX } from "react";

import { isNodeOfType } from "@/shared/flow_graph.js";
import {
    MIN_SCRIPT_TIMEOUT_MINUTES,
    scriptConfigSchema,
} from "@/shared/node_configs/script_config.js";
import type { ScriptConfig } from "@/shared/node_configs/script_config.js";
import { AdvancedSection } from "@/web/canvas/inspector/advanced_section.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { TextField } from "@/web/canvas/inspector/text_field.js";

export function ScriptInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    // The registry routes only scripts here; the check narrows the node to its script config.
    if (!isNodeOfType(node, "script")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig = (changes: Partial<ScriptConfig>): void =>
        onChange((current) => withNodeConfig(current, "script", changes));

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <TextField
                    doc={fieldDoc("script", "command")}
                    text={config.command}
                    placeholder="npm test"
                    hint="roda dentro do container do item"
                    mono
                    onChange={(command) => changeConfig({ command })}
                />
            </InspectorFields>
            <AdvancedSection>
                <IntegerField
                    doc={fieldDoc("script", "timeoutMinutes")}
                    value={config.timeoutMinutes}
                    schema={scriptConfigSchema.shape.timeoutMinutes}
                    limits={{ min: MIN_SCRIPT_TIMEOUT_MINUTES }}
                    onChange={(timeoutMinutes) => changeConfig({ timeoutMinutes })}
                />
            </AdvancedSection>
        </NodeInspectorFrame>
    );
}
