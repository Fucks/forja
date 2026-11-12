import type { UseQueryResult } from "@tanstack/react-query";

import type { FlowGraph } from "@/shared/flow_graph.js";
import type { ApiError } from "@/web/api/api_client.js";
import { useFlowVersion, useSavedFlowDraft } from "@/web/app/flows/use_flow_versions.js";

export type ComparisonTarget = "previous" | "draft";

export interface ComparedGraph {
    label: string;
    graph: FlowGraph;
}

export type VersionComparison =
    | { status: "loading" }
    | { status: "failed"; message: string }
    | { status: "ready"; before: ComparedGraph; after: ComparedGraph };

export const DRAFT_LABEL = "Rascunho";

interface ComparedSide {
    label: string;
    query: UseQueryResult<{ graph: FlowGraph }, ApiError>;
}

/** The older side is always `before`: the previous version, or the selected one against the
 * draft. */
export function useVersionComparison({
    flowId,
    selectedVersion,
    previousVersion,
    target,
}: {
    flowId: string;
    selectedVersion: number;
    previousVersion: number | undefined;
    target: ComparisonTarget;
}): VersionComparison {
    const selected = useFlowVersion(flowId, selectedVersion);
    const previous = useFlowVersion(flowId, target === "previous" ? previousVersion : undefined);
    const draft = useSavedFlowDraft(flowId);
    const selectedSide = { label: versionLabel(selectedVersion), query: selected };

    if (target === "draft" || previousVersion === undefined) {
        return compareSides(selectedSide, { label: DRAFT_LABEL, query: draft });
    }

    return compareSides({ label: versionLabel(previousVersion), query: previous }, selectedSide);
}

export function versionLabel(version: number): string {
    return `v${version}`;
}

function compareSides(before: ComparedSide, after: ComparedSide): VersionComparison {
    const error = before.query.error ?? after.query.error;
    if (error) {
        return { status: "failed", message: error.message };
    }
    if (!before.query.data || !after.query.data) {
        return { status: "loading" };
    }

    return {
        status: "ready",
        before: { label: before.label, graph: before.query.data.graph },
        after: { label: after.label, graph: after.query.data.graph },
    };
}
