import { useStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import type { JSX, ReactNode } from "react";

import type { FlowNode, Port } from "@/shared/flow_graph.js";
import { BaseNode } from "@/web/canvas/base/base_node.js";
import type { BaseNodeProps } from "@/web/canvas/base/base_node.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { NODE_TYPE_LABELS } from "@/web/canvas/base/node_type_labels.js";
import type { PortView } from "@/web/canvas/base/port_handle.js";
import { describePort } from "@/web/canvas/base/port_label.js";
import { ITEM_INPUT_PORT, useHasImplicitItem } from "@/web/canvas/implicit_item_overlay.js";
import { ImplicitItemBadge, NeedsConfigBadge } from "@/web/canvas/nodes/node_badges.js";
import { useNodeLiveState } from "@/web/canvas/nodes/node_live_context.js";
import { useTargetValidation } from "@/web/canvas/validation_overlay.js";
import { nodeDocPath } from "@/web/config/navigation.js";

const COMPACT_ZOOM_THRESHOLD = 0.5;

interface FlowNodeCardProps {
    node: FlowNode;
    selected: boolean;
    summary: ReactNode;
}

export function FlowNodeCard({ node, selected, summary }: FlowNodeCardProps): JSX.Element {
    const { status, badge } = useNodeLiveState(node.id);
    const { invalid, needsConfiguration, issueMessages } = useTargetValidation(node.id);
    const isCompact = useStore(isZoomedOut);
    const hasImplicitItem = useHasImplicitItem();

    return (
        <BaseNode
            typeIcon={NODE_TYPE_ICONS[node.type]}
            typeLabel={NODE_TYPE_LABELS[node.type]}
            label={node.label}
            summary={summary}
            inputs={describeInputs(node, { hasImplicitItem })}
            outputs={node.outputs.map((port) => describeNodePort(node, port))}
            status={status}
            badge={badge}
            notice={needsConfiguration ? <NeedsConfigBadge /> : undefined}
            selected={selected}
            invalid={invalid}
            issueMessages={issueMessages}
            documentationHref={nodeDocPath(node.type)}
            compact={isCompact}
        />
    );
}

function describeInputs(
    node: FlowNode,
    { hasImplicitItem }: { hasImplicitItem: boolean },
): BaseNodeProps["inputs"] {
    return node.inputs.map((port) => {
        const describedPort = describeNodePort(node, port);
        if (!hasImplicitItem || port.name !== ITEM_INPUT_PORT) {
            return describedPort;
        }

        return { ...describedPort, badge: <ImplicitItemBadge /> };
    });
}

function describeNodePort(node: FlowNode, port: Port): PortView & Port {
    return { ...port, ...describePort(node.type, port) };
}

function isZoomedOut(canvas: ReactFlowState): boolean {
    const [, , zoom] = canvas.transform;
    return zoom < COMPACT_ZOOM_THRESHOLD;
}
