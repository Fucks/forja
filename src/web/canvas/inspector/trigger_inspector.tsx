import type { JSX } from "react";
import { Link, useParams } from "react-router";

import { isNodeOfType } from "@/shared/flow_graph.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { TRIGGER_KIND_LABELS } from "@/web/canvas/nodes/node_summary.js";
import { triggersPath } from "@/web/config/navigation.js";
import { Button } from "@/web/components/ui/button.js";

// The trigger itself (cron, event) is configured on the triggers page, so the node only shows its kind.
export function TriggerInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    const { projectId = "" } = useParams();
    // The registry routes only triggers here; the check narrows the node to its trigger config.
    if (!isNodeOfType(node, "trigger")) {
        return <></>;
    }

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <div className="flex flex-col gap-1">
                    <FieldHeading doc={fieldDoc("trigger", "kind")} />
                    <p className="text-sm text-text">{TRIGGER_KIND_LABELS[node.config.kind]}</p>
                </div>
                <Button asChild>
                    <Link to={triggersPath(projectId)}>Configurar gatilhos</Link>
                </Button>
            </InspectorFields>
        </NodeInspectorFrame>
    );
}
