import type { JSX } from "react";

import { isNodeOfType } from "@/shared/flow_graph.js";
import { ITEM_DESTINATIONS } from "@/shared/node_configs/output_config.js";
import type { OutputConfig } from "@/shared/node_configs/output_config.js";
import { fieldDoc, fieldOptionCards } from "@/web/canvas/inspector/field_doc.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import type { OptionCard } from "@/web/canvas/inspector/option_cards.js";
import { OptionCardsField } from "@/web/canvas/inspector/option_cards_field.js";
import { SwitchField } from "@/web/canvas/inspector/switch_field.js";

type ItemDestination = (typeof ITEM_DESTINATIONS)[number];
type DestinationChoice = ItemDestination | typeof KEEP_ITEM;

// The extra card stands for "no destination", so choosing it reports undefined.
const KEEP_ITEM = "keep";
const KEEP_ITEM_CARD: OptionCard<typeof KEEP_ITEM> = {
    value: KEEP_ITEM,
    label: "Não mover",
    description: "O item fica onde está no board.",
};

const COMMENT_ON_ISSUE_HINT =
    "O comentário traz o resultado da run e o link do PR. O motivo vem da primeira entrada com " +
    "reason, notes ou failureSummary, como as notas do Reviewer.";
const DESTINATION_DOC = fieldDoc("output", "moveItemTo");
const DESTINATION_CARDS: OptionCard<DestinationChoice>[] = [
    ...fieldOptionCards(DESTINATION_DOC, ITEM_DESTINATIONS),
    KEEP_ITEM_CARD,
];

export function OutputInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    // The registry routes only outputs here; the check narrows the node to its output config.
    if (!isNodeOfType(node, "output")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig = (changes: Partial<OutputConfig>): void =>
        onChange((current) => withNodeConfig(current, "output", changes));

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <OptionCardsField
                    doc={DESTINATION_DOC}
                    value={config.moveItemTo ?? KEEP_ITEM}
                    options={DESTINATION_CARDS}
                    onChange={(destination) =>
                        changeConfig({ moveItemTo: toMoveItemTo(destination) })
                    }
                />
                <SwitchField
                    doc={fieldDoc("output", "commentOnIssue")}
                    checked={config.commentOnIssue}
                    hint={COMMENT_ON_ISSUE_HINT}
                    onChange={(commentOnIssue) => changeConfig({ commentOnIssue })}
                />
            </InspectorFields>
        </NodeInspectorFrame>
    );
}

function toMoveItemTo(destination: DestinationChoice): ItemDestination | undefined {
    return destination === KEEP_ITEM ? undefined : destination;
}
