import { useState } from "react";
import type { JSX } from "react";

import { isNodeOfType } from "@/shared/flow_graph.js";
import {
    MAX_SOURCE_LIMIT,
    MIN_SOURCE_LIMIT,
    SOURCE_PROVIDERS,
    sourceConfigSchema,
} from "@/shared/node_configs/source_config.js";
import type { SourceConfig } from "@/shared/node_configs/source_config.js";
import { fieldDoc, fieldOptionCards } from "@/web/canvas/inspector/field_doc.js";
import { FieldHint } from "@/web/canvas/inspector/field_hint.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { OptionCardsField } from "@/web/canvas/inspector/option_cards_field.js";
import { SourcePreviewDialog } from "@/web/canvas/inspector/source_preview_dialog.js";
import { SwitchField } from "@/web/canvas/inspector/switch_field.js";
import { TextField, toOptionalText } from "@/web/canvas/inspector/text_field.js";
import { useFlowInEditor } from "@/web/canvas/inspector/use_last_node_run_sample.js";
import { Button } from "@/web/components/ui/button.js";

const PROVIDER_DOC = fieldDoc("source", "provider");
const PROVIDER_CARDS = fieldOptionCards(PROVIDER_DOC, SOURCE_PROVIDERS);

export function SourceInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    // The registry routes only sources here; the check narrows the node to its source config.
    if (!isNodeOfType(node, "source")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig = (changes: Partial<SourceConfig>): void =>
        onChange((current) => withNodeConfig(current, "source", changes));

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <OptionCardsField
                    doc={PROVIDER_DOC}
                    value={config.provider}
                    options={PROVIDER_CARDS}
                    onChange={(provider) => changeConfig({ provider })}
                />
                <TextField
                    doc={fieldDoc("source", "label")}
                    text={config.label ?? ""}
                    placeholder="todas as issues"
                    onChange={(label) => changeConfig({ label: toOptionalText(label) })}
                />
                <IntegerField
                    doc={fieldDoc("source", "limit")}
                    value={config.limit}
                    schema={sourceConfigSchema.shape.limit}
                    limits={{ min: MIN_SOURCE_LIMIT, max: MAX_SOURCE_LIMIT }}
                    onChange={(limit) => changeConfig({ limit })}
                />
                <div className="flex flex-col gap-1">
                    <SwitchField
                        doc={fieldDoc("source", "skipBlocked")}
                        checked={config.skipBlocked}
                        onChange={(skipBlocked) => changeConfig({ skipBlocked })}
                    />
                    <FieldHint>#12 com ‘depends on #10’ só entra quando #10 fechar</FieldHint>
                </div>
                <SourcePreviewButton config={config} />
            </InspectorFields>
        </NodeInspectorFrame>
    );
}

function SourcePreviewButton({ config }: { config: SourceConfig }): JSX.Element {
    const flow = useFlowInEditor();
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    if (!flow) {
        return <></>;
    }

    return (
        <>
            <Button onClick={() => setIsPreviewOpen(true)}>Ver o que seria buscado agora</Button>
            {isPreviewOpen && (
                <SourcePreviewDialog
                    flow={flow}
                    config={config}
                    onClose={() => setIsPreviewOpen(false)}
                />
            )}
        </>
    );
}
