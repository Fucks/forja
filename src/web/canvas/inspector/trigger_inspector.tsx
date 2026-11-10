import type { JSX } from "react";
import { Link, useParams } from "react-router";

import { isNodeOfType } from "@/shared/flow_graph.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { TRIGGER_KIND_LABELS } from "@/web/canvas/nodes/node_summary.js";
import { triggersPath } from "@/web/config/navigation.js";
import { Button } from "@/web/components/ui/button.js";
import { KeyValue } from "@/web/components/ui/key_value.js";

// The trigger itself (cron, event) is configured on the triggers page, so the node only shows its kind.
export function TriggerInspector({ node, onChange }: InspectorProps): JSX.Element {
    const { projectId = "" } = useParams();
    if (!isNodeOfType(node, "trigger")) {
        return <></>;
    }

    return (
        <NodeInspectorFrame node={node} onChange={onChange} title="Gatilho">
            <KeyValue items={[{ label: "Tipo", value: TRIGGER_KIND_LABELS[node.config.kind] }]} />
            <Button asChild>
                <Link to={triggersPath(projectId)}>Configurar gatilhos</Link>
            </Button>
        </NodeInspectorFrame>
    );
}
