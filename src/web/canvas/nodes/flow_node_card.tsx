import { useStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import { useState } from "react";
import type { JSX, ReactNode } from "react";

import type { FlowNode, Port } from "@/shared/flow_graph.js";
import { BaseNode } from "@/web/canvas/base/base_node.js";
import type { BaseNodeProps } from "@/web/canvas/base/base_node.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { NODE_TYPE_LABELS } from "@/web/canvas/base/node_type_labels.js";
import type { PortView } from "@/web/canvas/base/port_handle.js";
import { describeNodePort } from "@/web/canvas/base/port_label.js";
import { ITEM_INPUT_PORT, useHasImplicitItem } from "@/web/canvas/implicit_item_overlay.js";
import { ImplicitItemBadge, NeedsConfigBadge } from "@/web/canvas/nodes/node_badges.js";
import { useNodeLiveState } from "@/web/canvas/nodes/node_live_context.js";
import { useTargetValidation } from "@/web/canvas/validation_overlay.js";
import { NodeDocDrawer } from "@/web/docs/node_doc_drawer.js";

const COMPACT_ZOOM_THRESHOLD = 0.5;
const BADGE_ZOOM_THRESHOLD = 0.6;

interface FlowNodeCardProps {
    node: FlowNode;
    selected: boolean;
    summary: ReactNode;
}

export function FlowNodeCard({ node, selected, summary }: FlowNodeCardProps): JSX.Element {
    const { status, badge } = useNodeLiveState(node.id);
    const { invalid, needsConfiguration, issueMessages } = useTargetValidation(node.id);
    const isCompact = useStore(isZoomedOut);
    const areBadgesVisible = useStore(isZoomedInEnoughForBadges);
    const showsImplicitItemBadge = useHasImplicitItem(node.id) && areBadgesVisible;
    const showsNeedsConfigBadge = needsConfiguration && areBadgesVisible;
    const [isDocumentationOpen, setIsDocumentationOpen] = useState(false);

    return (
        <>
            <BaseNode
                typeIcon={NODE_TYPE_ICONS[node.type]}
                typeLabel={NODE_TYPE_LABELS[node.type]}
                label={node.label}
                summary={summary}
                inputs={describeInputs(node, { showsImplicitItemBadge })}
                outputs={node.outputs.map((port) => describePortView(node, port))}
                status={status}
                badge={badge}
                notice={showsNeedsConfigBadge ? <NeedsConfigBadge /> : undefined}
                selected={selected}
                invalid={invalid}
                issueMessages={issueMessages}
                onShowDocumentation={() => setIsDocumentationOpen(true)}
                compact={isCompact}
            />
            <NodeDocDrawer
                type={node.type}
                open={isDocumentationOpen}
                onOpenChange={setIsDocumentationOpen}
            />
        </>
    );
}

function describeInputs(
    node: FlowNode,
    { showsImplicitItemBadge }: { showsImplicitItemBadge: boolean },
): BaseNodeProps["inputs"] {
    return node.inputs.map((port) => {
        const describedPort = describePortView(node, port);
        if (!showsImplicitItemBadge || port.name !== ITEM_INPUT_PORT) {
            return describedPort;
        }

        return { ...describedPort, badge: <ImplicitItemBadge /> };
    });
}

function describePortView(node: FlowNode, port: Port): PortView & Port {
    return { ...port, ...describeNodePort(node, port) };
}

function isZoomedOut(canvas: ReactFlowState): boolean {
    return zoomOf(canvas) < COMPACT_ZOOM_THRESHOLD;
}

function isZoomedInEnoughForBadges(canvas: ReactFlowState): boolean {
    return zoomOf(canvas) >= BADGE_ZOOM_THRESHOLD;
}

function zoomOf(canvas: ReactFlowState): number {
    const [, , zoom] = canvas.transform;
    return zoom;
}
