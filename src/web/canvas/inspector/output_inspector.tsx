import type { JSX } from "react";

import { isNodeOfType } from "@/shared/flow_graph.js";
import { ITEM_DESTINATIONS } from "@/shared/node_configs/output_config.js";
import type { OutputConfig } from "@/shared/node_configs/output_config.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { OptionalSelectField, toSelectOptions } from "@/web/canvas/inspector/select_field.js";
import { ITEM_DESTINATION_LABELS } from "@/web/canvas/nodes/node_summary.js";
import { Switch } from "@/web/components/ui/switch.js";

const DESTINATION_OPTIONS = toSelectOptions(ITEM_DESTINATIONS, ITEM_DESTINATION_LABELS);

export function OutputInspector({ node, onChange }: InspectorProps): JSX.Element {
    // The registry routes only outputs here; the check narrows the node to its output config.
    if (!isNodeOfType(node, "output")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig = (changes: Partial<OutputConfig>): void =>
        onChange((current) => withNodeConfig(current, "output", changes));

    return (
        <NodeInspectorFrame node={node} onChange={onChange} title="Saída">
            <OptionalSelectField
                label="Mover item para"
                value={config.moveItemTo}
                options={DESTINATION_OPTIONS}
                emptyLabel="não mover"
                onChange={(moveItemTo) => changeConfig({ moveItemTo })}
            />
            <Switch
                label="Comentar na issue"
                checked={config.commentOnIssue}
                onChange={(commentOnIssue) => changeConfig({ commentOnIssue })}
            />
        </NodeInspectorFrame>
    );
}
