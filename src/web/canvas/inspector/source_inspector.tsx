import type { JSX } from "react";

import { isNodeOfType } from "@/shared/flow_graph.js";
import {
    MAX_SOURCE_LIMIT,
    MIN_SOURCE_LIMIT,
    SOURCE_PROVIDERS,
    sourceConfigSchema,
} from "@/shared/node_configs/source_config.js";
import type { SourceConfig } from "@/shared/node_configs/source_config.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { SelectField, toSelectOptions } from "@/web/canvas/inspector/select_field.js";
import { TextField, toOptionalText } from "@/web/canvas/inspector/text_field.js";
import { SOURCE_PROVIDER_LABELS } from "@/web/canvas/nodes/node_summary.js";
import { Switch } from "@/web/components/ui/switch.js";

const PROVIDER_OPTIONS = toSelectOptions(SOURCE_PROVIDERS, SOURCE_PROVIDER_LABELS);

export function SourceInspector({ node, onChange }: InspectorProps): JSX.Element {
    // The registry routes only sources here; the check narrows the node to its source config.
    if (!isNodeOfType(node, "source")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig = (changes: Partial<SourceConfig>): void =>
        onChange((current) => withNodeConfig(current, "source", changes));

    return (
        <NodeInspectorFrame node={node} onChange={onChange} title="Fonte de itens">
            <SelectField
                label="Provedor"
                value={config.provider}
                options={PROVIDER_OPTIONS}
                onChange={(provider) => changeConfig({ provider })}
            />
            <TextField
                label="Label"
                text={config.label ?? ""}
                placeholder="todas as issues"
                onChange={(label) => changeConfig({ label: toOptionalText(label) })}
            />
            <IntegerField
                label="Limite de itens"
                value={config.limit}
                schema={sourceConfigSchema.shape.limit}
                limits={{ min: MIN_SOURCE_LIMIT, max: MAX_SOURCE_LIMIT }}
                onChange={(limit) => changeConfig({ limit })}
            />
            <Switch
                label="Pular issues bloqueadas"
                checked={config.skipBlocked}
                onChange={(skipBlocked) => changeConfig({ skipBlocked })}
            />
        </NodeInspectorFrame>
    );
}
