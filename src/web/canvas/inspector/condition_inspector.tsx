import { useMemo } from "react";
import type { JSX } from "react";

import { isNodeOfType } from "@/shared/flow_graph.js";
import { ConditionEditor } from "@/web/canvas/inspector/condition_editor.js";
import { listUpstreamOutputPaths } from "@/web/canvas/inspector/condition_suggestions.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";

export function ConditionInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    const suggestions = useMemo(() => listUpstreamOutputPaths(graph, node.id), [graph, node.id]);
    // The registry routes only conditions here; the check narrows the node to its condition config.
    if (!isNodeOfType(node, "condition")) {
        return <></>;
    }

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <FieldHeading doc={fieldDoc("condition", "condition")} />
                <ConditionEditor
                    value={node.config.condition}
                    suggestions={suggestions}
                    onChange={(condition) =>
                        onChange((current) => withNodeConfig(current, "condition", { condition }))
                    }
                />
            </InspectorFields>
        </NodeInspectorFrame>
    );
}
