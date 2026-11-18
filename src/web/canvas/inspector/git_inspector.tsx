import type { JSX } from "react";

import { checkGitBodySource } from "@/engine/validation_rules/git_rules.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowGraph, NodeOfType } from "@/shared/flow_graph.js";
import { GIT_ACTIONS } from "@/shared/node_configs/git_config.js";
import type { GitConfig } from "@/shared/node_configs/git_config.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import { DataPathField } from "@/web/canvas/inspector/data_path_field.js";
import { fieldDoc, fieldOptionCards } from "@/web/canvas/inspector/field_doc.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { OptionCardsField } from "@/web/canvas/inspector/option_cards_field.js";
import { SwitchField } from "@/web/canvas/inspector/switch_field.js";
import { TextField, toOptionalText } from "@/web/canvas/inspector/text_field.js";
import { useAvailableData } from "@/web/canvas/inspector/use_available_data.js";

const ACTION_DOC = fieldDoc("git", "action");
const ACTION_CARDS = fieldOptionCards(ACTION_DOC, GIT_ACTIONS);
const TEXT_DATA_TYPE = "string";

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
                <PullRequestBodyField
                    gitNode={node}
                    graph={graph}
                    onChange={(bodyFrom) => changeConfig({ bodyFrom })}
                />
            </InspectorFields>
        </NodeInspectorFrame>
    );
}

function PullRequestBodyField({
    gitNode,
    graph,
    onChange,
}: {
    gitNode: NodeOfType<"git">;
    graph: FlowGraph;
    onChange: (bodyFrom: string | undefined) => void;
}): JSX.Element {
    const fields = useAvailableData(graph, gitNode.id, { scope: "node" });
    const bodySourceIssues = checkGitBodySource(graph, gitNode);

    return (
        <div className="flex flex-col gap-1">
            <DataPathField
                doc={fieldDoc("git", "bodyFrom")}
                path={gitNode.config.bodyFrom}
                fields={listTextFieldsFirst(fields)}
                onChange={onChange}
            />
            {bodySourceIssues.map((issue) => (
                <p key={issue.code} className="text-xs text-status-waiting">
                    {issue.message}
                </p>
            ))}
        </div>
    );
}

// The PR body is a text, so the text fields are the likely choice.
function listTextFieldsFirst(fields: PickableDataField[]): PickableDataField[] {
    const textFields = fields.filter((field) => field.type === TEXT_DATA_TYPE);
    const otherFields = fields.filter((field) => field.type !== TEXT_DATA_TYPE);

    return [...textFields, ...otherFields];
}
