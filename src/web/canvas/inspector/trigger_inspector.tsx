import type { JSX } from "react";
import { Link, useParams } from "react-router";

import { isNodeOfType } from "@/shared/flow_graph.js";
import { TRIGGER_KINDS } from "@/shared/trigger_types.js";
import { fieldDoc, fieldOptionCards } from "@/web/canvas/inspector/field_doc.js";
import { FieldHint } from "@/web/canvas/inspector/field_hint.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { OptionCardsField } from "@/web/canvas/inspector/option_cards_field.js";
import { triggersPath } from "@/web/config/navigation.js";
import { Button } from "@/web/components/ui/button.js";

const KIND_DOC = fieldDoc("trigger", "kind");
const KIND_CARDS = fieldOptionCards(KIND_DOC, TRIGGER_KINDS);

// The schedule, the event or the webhook of the trigger are set on the triggers page.
export function TriggerInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    const { projectId = "" } = useParams();
    // The registry routes only triggers here; the check narrows the node to its trigger config.
    if (!isNodeOfType(node, "trigger")) {
        return <></>;
    }

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <OptionCardsField
                    doc={KIND_DOC}
                    value={node.config.kind}
                    options={KIND_CARDS}
                    onChange={(kind) =>
                        onChange((current) => withNodeConfig(current, "trigger", { kind }))
                    }
                />
                <div className="flex flex-col gap-1">
                    <Button asChild>
                        <Link to={triggersPath(projectId)}>Configurar em Gatilhos</Link>
                    </Button>
                    <FieldHint>O horário, o evento e o webhook ficam na tela Gatilhos.</FieldHint>
                </div>
            </InspectorFields>
        </NodeInspectorFrame>
    );
}
