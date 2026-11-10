import { createContext, useContext } from "react";

import type { GroupProgress } from "@/web/canvas/base/group_frame.js";
import type { ExecutionStatus } from "@/web/components/ui/execution_status.js";

export interface NodeLiveState {
    status?: ExecutionStatus;
    badge?: string;
    progress?: GroupProgress;
}

const NO_LIVE_STATE: NodeLiveState = {};

// The editor leaves this map empty; the live run view (#63) fills it by node and group id.
export const NodeLiveContext = createContext<Map<string, NodeLiveState>>(new Map());

export function useNodeLiveState(id: string): NodeLiveState {
    return useContext(NodeLiveContext).get(id) ?? NO_LIVE_STATE;
}
