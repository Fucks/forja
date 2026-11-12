import { MousePointerClick } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import { NODE_RUN_TERMINAL } from "@/engine/node_run_state.js";
import type { FlowNode } from "@/shared/flow_graph.js";
import type { SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import {
    DEFAULT_DRAWER_HEIGHT_FRACTION,
    DrawerResizeHandle,
} from "@/web/canvas/live/drawer_resize_handle.js";
import { NodeRunDetail } from "@/web/canvas/live/node_run_detail.js";
import { NodeRunList } from "@/web/canvas/live/node_run_list.js";
import { sortNodeRuns } from "@/web/canvas/live/node_run_sorting.js";
import { useNodeRunUsage } from "@/web/canvas/live/use_node_run_usage.js";
import type { UsageByNodeRun } from "@/web/canvas/live/use_node_run_usage.js";
import { Drawer } from "@/web/components/ui/drawer.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";

export function NodeRunDrawer({
    view,
    node,
    initialNodeRunId,
    onClose,
}: {
    view: SerializedRunView;
    node: FlowNode;
    initialNodeRunId?: string;
    onClose: () => void;
}): JSX.Element {
    const [heightFraction, setHeightFraction] = useState(DEFAULT_DRAWER_HEIGHT_FRACTION);
    const [selectedNodeRunId, setSelectedNodeRunId] = useState(initialNodeRunId);
    const nodeRuns = sortNodeRuns(view.nodeRuns.filter((nodeRun) => nodeRun.nodeId === node.id));
    const usageByNodeRun = useNodeRunUsage(view.run.id, countFinished(nodeRuns));
    const selectedNodeRun = nodeRuns.find((nodeRun) => nodeRun.id === selectedNodeRunId);

    return (
        <Drawer
            open
            onOpenChange={onClose}
            side="bottom"
            title={node.label}
            size={heightFraction * window.innerHeight}
        >
            <div className="flex h-full flex-col">
                <DrawerResizeHandle heightFraction={heightFraction} onResize={setHeightFraction} />
                <div className="flex min-h-0 flex-1 gap-4">
                    <div className="w-80 shrink-0 overflow-auto">
                        <NodeRunList
                            nodeRuns={nodeRuns}
                            usageByNodeRun={usageByNodeRun}
                            selectedNodeRunId={selectedNodeRunId}
                            onSelect={setSelectedNodeRunId}
                        />
                    </div>
                    <div className="min-w-0 flex-1 overflow-auto">
                        <SelectedNodeRun
                            nodeRun={selectedNodeRun}
                            usageByNodeRun={usageByNodeRun}
                        />
                    </div>
                </div>
            </div>
        </Drawer>
    );
}

function countFinished(nodeRuns: SerializedNodeRun[]): number {
    return nodeRuns.filter((nodeRun) => NODE_RUN_TERMINAL.has(nodeRun.status)).length;
}

function SelectedNodeRun({
    nodeRun,
    usageByNodeRun,
}: {
    nodeRun?: SerializedNodeRun;
    usageByNodeRun: UsageByNodeRun;
}): JSX.Element {
    if (!nodeRun) {
        return (
            <EmptyState
                icon={MousePointerClick}
                title="Escolha uma execução"
                description="Veja as entradas, as saídas e os artefatos de uma execução do nó."
            />
        );
    }

    return (
        <NodeRunDetail key={nodeRun.id} nodeRun={nodeRun} usage={usageByNodeRun.get(nodeRun.id)} />
    );
}
