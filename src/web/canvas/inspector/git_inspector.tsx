import type { JSX } from "react";

import { isNodeOfType } from "@/shared/flow_graph.js";
import type { NodeOfType } from "@/shared/flow_graph.js";
import { GIT_ACTIONS } from "@/shared/node_configs/git_config.js";
import type { GitConfig } from "@/shared/node_configs/git_config.js";
import { AdvancedSection } from "@/web/canvas/inspector/advanced_section.js";
import { fieldDoc, fieldOptionCards } from "@/web/canvas/inspector/field_doc.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { OptionCardsField } from "@/web/canvas/inspector/option_cards_field.js";
import { OptionalSelectField } from "@/web/canvas/inspector/select_field.js";
import { SwitchField } from "@/web/canvas/inspector/switch_field.js";
import { TextField, toOptionalText } from "@/web/canvas/inspector/text_field.js";

const ACTION_DOC = fieldDoc("git", "action");
const ACTION_CARDS = fieldOptionCards(ACTION_DOC, GIT_ACTIONS);

export function GitInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    // The registry routes only git nodes here; the check narrows the node to its git config.
    if (!isNodeOfType(node, "git")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig = (changes: Partial<GitConfig>): void =>
        onChange((current) => withNodeConfig(current, "git", changes));

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <OptionCardsField
                    doc={ACTION_DOC}
                    value={config.action}
                    options={ACTION_CARDS}
                    onChange={(action) => changeConfig({ action })}
                />
                <TextField
                    doc={fieldDoc("git", "baseBranch")}
                    text={config.baseBranch ?? ""}
                    placeholder="do projeto"
                    mono
                    onChange={(baseBranch) =>
                        changeConfig({ baseBranch: toOptionalText(baseBranch) })
                    }
                />
                <SwitchField
                    doc={fieldDoc("git", "draft")}
                    checked={config.draft}
                    onChange={(draft) => changeConfig({ draft })}
                />
            </InspectorFields>
            <AdvancedSection>
                <OptionalSelectField
                    doc={fieldDoc("git", "bodyFrom")}
                    value={config.bodyFrom}
                    options={listInputPortOptions(node)}
                    emptyLabel="nenhuma"
                    onChange={(bodyFrom) => changeConfig({ bodyFrom })}
                />
            </AdvancedSection>
        </NodeInspectorFrame>
    );
}

function listInputPortOptions(gitNode: NodeOfType<"git">): { value: string; label: string }[] {
    return gitNode.inputs.map((port) => ({ value: port.name, label: port.name }));
}
