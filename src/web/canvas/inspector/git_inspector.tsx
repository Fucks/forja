import type { JSX } from "react";

import { isNodeOfType } from "@/shared/flow_graph.js";
import type { NodeOfType } from "@/shared/flow_graph.js";
import { GIT_ACTIONS } from "@/shared/node_configs/git_config.js";
import type { GitConfig } from "@/shared/node_configs/git_config.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import {
    OptionalSelectField,
    SelectField,
    toSelectOptions,
} from "@/web/canvas/inspector/select_field.js";
import { TextField, toOptionalText } from "@/web/canvas/inspector/text_field.js";
import { GIT_ACTION_LABELS } from "@/web/canvas/nodes/node_summary.js";
import { Switch } from "@/web/components/ui/switch.js";

const ACTION_OPTIONS = toSelectOptions(GIT_ACTIONS, GIT_ACTION_LABELS);

export function GitInspector({ node, onChange }: InspectorProps): JSX.Element {
    // The registry routes only git nodes here; the check narrows the node to its git config.
    if (!isNodeOfType(node, "git")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig = (changes: Partial<GitConfig>): void =>
        onChange((current) => withNodeConfig(current, "git", changes));

    return (
        <NodeInspectorFrame node={node} onChange={onChange} title="Git">
            <SelectField
                label="Ação"
                value={config.action}
                options={ACTION_OPTIONS}
                onChange={(action) => changeConfig({ action })}
            />
            <TextField
                label="Branch base"
                text={config.baseBranch ?? ""}
                placeholder="do projeto"
                mono
                onChange={(baseBranch) => changeConfig({ baseBranch: toOptionalText(baseBranch) })}
            />
            <Switch
                label="Abrir como rascunho"
                checked={config.draft}
                onChange={(draft) => changeConfig({ draft })}
            />
            <OptionalSelectField
                label="Corpo do PR a partir da porta"
                value={config.bodyFrom}
                options={listInputPortOptions(node)}
                emptyLabel="nenhuma"
                onChange={(bodyFrom) => changeConfig({ bodyFrom })}
            />
        </NodeInspectorFrame>
    );
}

function listInputPortOptions(gitNode: NodeOfType<"git">): { value: string; label: string }[] {
    return gitNode.inputs.map((port) => ({ value: port.name, label: port.name }));
}
