import type { FlowSummary } from "@/shared/flow_types.js";

export function findFlowName(flows: FlowSummary[], flowId: string): string {
    return flows.find((flow) => flow.id === flowId)?.name ?? flowId;
}
